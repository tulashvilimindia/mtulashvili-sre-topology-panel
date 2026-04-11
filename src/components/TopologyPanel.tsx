import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { PanelProps } from '@grafana/data';
import { TopologyPanelOptions, NodeRuntimeState, NodeStatus, EdgeRuntimeState, MetricValue } from '../types';
import { TopologyCanvas } from './TopologyCanvas';
import { autoLayout } from '../utils/layout';
import { calculateEdgeStatus, getEdgeColor, calculateThickness, calculateFlowSpeed } from '../utils/edges';
import './TopologyPanel.css';

interface Props extends PanelProps<TopologyPanelOptions> {}

export const TopologyPanel: React.FC<Props> = ({ options, onOptionsChange, data, width, height }) => {
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const nodes = useMemo(() => options.nodes || [], [options.nodes]);
  const edges = useMemo(() => options.edges || [], [options.edges]);
  const groups = useMemo(() => options.groups || [], [options.groups]);
  const { canvas, animation, layout, display } = options;

  // Ref to read current positions without triggering useEffect re-runs
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  // Initialize positions from node configs or auto-layout
  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }

    const currentPositions = nodePositionsRef.current;

    // Skip if all current nodes already have positions
    const allPositioned = nodes.every((n) => currentPositions.has(n.id));
    if (allPositioned) {
      return;
    }

    const positions = new Map<string, { x: number; y: number }>();
    let needsAutoLayout = false;

    nodes.forEach((node) => {
      // Preserve existing drag positions for nodes that already have them
      const existing = currentPositions.get(node.id);
      if (existing) {
        positions.set(node.id, existing);
      } else if (node.position && (node.position.x !== 100 || node.position.y !== 100)) {
        positions.set(node.id, { ...node.position });
      } else {
        needsAutoLayout = true;
      }
    });

    if (needsAutoLayout || positions.size < nodes.length) {
      const autoPositions = autoLayout(nodes, edges, {
        direction: layout.direction,
        tierSpacing: layout.tierSpacing,
        nodeSpacing: layout.nodeSpacing,
        canvasWidth: width,
        canvasHeight: height,
      });
      autoPositions.forEach((pos, id) => {
        if (!positions.has(id)) {
          positions.set(id, pos);
        }
      });
    }

    setNodePositions(positions);
  }, [nodes, edges, layout, width, height]);

  // Compute runtime state from data frames
  const nodeStates = useMemo<Map<string, NodeRuntimeState>>(() => {
    const states = new Map<string, NodeRuntimeState>();

    nodes.forEach((node) => {
      const metricValues: Record<string, MetricValue> = {};
      let worstStatus: NodeStatus = node.metrics.length === 0 ? 'nodata' : 'ok';

      // Match data frames to node metrics
      node.metrics.forEach((metricConfig) => {
        const matchingFrame = data.series.find(
          (frame) => frame.refId === metricConfig.id || frame.name === metricConfig.label
        );

        if (matchingFrame && matchingFrame.fields.length > 1) {
          const valueField = matchingFrame.fields.find((f) => f.type === 'number');
          if (valueField && valueField.values.length > 0) {
            const raw = valueField.values[valueField.values.length - 1] as number;

            // Evaluate thresholds
            let status: 'ok' | 'warning' | 'critical' = 'ok';
            for (const t of [...metricConfig.thresholds].sort((a, b) => b.value - a.value)) {
              if (raw >= t.value) {
                status = t.color === 'red' ? 'critical' : t.color === 'yellow' ? 'warning' : 'ok';
                break;
              }
            }

            // Track worst status
            if (status === 'critical') {
              worstStatus = 'critical';
            } else if (status === 'warning' && worstStatus !== 'critical') {
              worstStatus = 'warning';
            }

            // Collect sparkline data
            const sparklineData = metricConfig.showSparkline
              ? (Array.from(valueField.values).slice(-12) as number[])
              : undefined;

            metricValues[metricConfig.id] = {
              raw,
              formatted: metricConfig.format.replace('${value}', formatNumber(raw)),
              status,
              sparklineData,
            };
          }
        }

        // If no matching data, set nodata
        if (!metricValues[metricConfig.id]) {
          metricValues[metricConfig.id] = {
            raw: null,
            formatted: 'N/A',
            status: 'unknown',
          };
        }
      });

      states.set(node.id, {
        nodeId: node.id,
        status: worstStatus,
        metricValues,
        expanded: expandedNodes.has(node.id),
      });
    });

    return states;
  }, [nodes, data, expandedNodes]);

  // Compute edge runtime state from data frames
  const edgeStates = useMemo<Map<string, EdgeRuntimeState>>(() => {
    const states = new Map<string, EdgeRuntimeState>();

    edges.forEach((edge) => {
      let value: number | null = null;

      // Match data frame to edge metric
      if (edge.metric) {
        const matchingFrame = data.series.find(
          (frame) => frame.refId === edge.id || frame.name === edge.metric!.alias
        );
        if (matchingFrame && matchingFrame.fields.length > 1) {
          const valueField = matchingFrame.fields.find((f) => f.type === 'number');
          if (valueField && valueField.values.length > 0) {
            value = valueField.values[valueField.values.length - 1] as number;
          }
        }
      }

      const status = calculateEdgeStatus(value, edge.thresholds);
      const color = getEdgeColor(status);
      const thickness = calculateThickness(value, edge.thicknessMode, edge.thicknessMin, edge.thicknessMax, edge.thresholds);
      const effectiveFlowSpeed = edge.flowSpeed || animation.defaultFlowSpeed || 'auto';
      const animationSpeed = animation.flowEnabled && edge.flowAnimation
        ? calculateFlowSpeed(value, effectiveFlowSpeed, edge.thresholds)
        : 0;

      // Interpolate label template
      let formattedLabel: string | undefined;
      if (edge.labelTemplate) {
        if (value !== null) {
          formattedLabel = edge.labelTemplate.replace('${value}', formatNumber(value));
        } else {
          formattedLabel = edge.labelTemplate.replace('${value}', 'N/A');
        }
      }

      states.set(edge.id, {
        edgeId: edge.id,
        status,
        value: value ?? undefined,
        formattedLabel,
        thickness,
        color,
        animationSpeed,
      });
    });

    return states;
  }, [edges, data, animation.flowEnabled, animation.defaultFlowSpeed]);

  // Persist positions to panel options after drag ends (debounced)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistPositions = useCallback((positions: Map<string, { x: number; y: number }>) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      const updatedNodes = nodes.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
      onOptionsChange({ ...options, nodes: updatedNodes });
    }, 300);
  }, [nodes, options, onOptionsChange]);

  // Handle node drag
  const handleNodeDrag = useCallback(
    (nodeId: string, x: number, y: number) => {
      setNodePositions((prev) => {
        const next = new Map(prev);
        let pos = { x, y };
        if (canvas.snapToGrid) {
          pos = {
            x: Math.round(x / canvas.gridSize) * canvas.gridSize,
            y: Math.round(y / canvas.gridSize) * canvas.gridSize,
          };
        }
        next.set(nodeId, pos);
        persistPositions(next);
        return next;
      });
    },
    [canvas.snapToGrid, canvas.gridSize, persistPositions]
  );

  // Handle node expand/collapse
  const handleNodeToggle = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Reset layout
  const handleResetLayout = useCallback(() => {
    const autoPositions = autoLayout(nodes, edges, {
      direction: layout.direction,
      tierSpacing: layout.tierSpacing,
      nodeSpacing: layout.nodeSpacing,
      canvasWidth: width,
      canvasHeight: height,
    });
    setNodePositions(autoPositions);
    setExpandedNodes(new Set());
  }, [nodes, edges, layout, width, height]);

  // Expand/collapse all
  const handleExpandAll = useCallback(() => {
    setExpandedNodes((prev) => {
      if (prev.size === nodes.length) {
        return new Set();
      }
      return new Set(nodes.map((n) => n.id));
    });
  }, [nodes]);

  return (
    <div className="topology-panel" style={{ width, height }}>
      <div className="topology-toolbar">
        <span className="topology-title">E2E topology</span>
        <div className="topology-toolbar-spacer" />
        <button className="topology-btn" onClick={handleResetLayout}>
          Auto layout
        </button>
        <button className="topology-btn" onClick={handleExpandAll}>
          {expandedNodes.size === nodes.length ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <TopologyCanvas
        nodes={nodes}
        edges={edges}
        groups={groups}
        nodePositions={nodePositions}
        nodeStates={nodeStates}
        edgeStates={edgeStates}
        canvasOptions={canvas}
        animationOptions={animation}
        displayOptions={display}
        width={width}
        height={height - 36} // subtract toolbar height
        onNodeDrag={handleNodeDrag}
        onNodeToggle={handleNodeToggle}
      />
    </div>
  );
};

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1e9) {
    return (value / 1e9).toFixed(1) + 'G';
  }
  if (Math.abs(value) >= 1e6) {
    return (value / 1e6).toFixed(1) + 'M';
  }
  if (Math.abs(value) >= 1e3) {
    return (value / 1e3).toFixed(1) + 'k';
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(1);
}
