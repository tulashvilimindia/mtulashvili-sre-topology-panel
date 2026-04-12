import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { PanelProps, DataFrame } from '@grafana/data';
import { TopologyPanelOptions, TopologyNode, TopologyEdge, NodeRuntimeState, NodeStatus, NodeType, EdgeRuntimeState, MetricValue, NodeMetricConfig, DatasourceQueryConfig, NODE_TYPE_CONFIG, STATUS_COLORS } from '../types';
import { TopologyCanvas } from './TopologyCanvas';
import { autoLayout } from '../utils/layout';
import { calculateEdgeStatus, getEdgeColor, calculateThickness, calculateFlowSpeed, isWorseStatus, propagateStatus } from '../utils/edges';
import { queryDatasource } from '../utils/datasourceQuery';
import { getExampleTopology } from '../editors/TopologyEditor';
import { NodePopup } from './NodePopup';
import './TopologyPanel.css';

interface Props extends PanelProps<TopologyPanelOptions> {}

// ─── Auto-fetch: query datasources for metrics not covered by panel queries ───
interface UncoveredMetric {
  metricId: string;
  dsUid: string;
  query: string;
  dsType?: string;
  queryConfig?: DatasourceQueryConfig;
}

function useSelfQueries(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  panelSeries: DataFrame[],
  replaceVars?: (value: string) => string
): Map<string, number | null> {
  const [results, setResults] = useState<Map<string, number | null>>(new Map());
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collect node + edge metrics that need self-querying
  const uncoveredMetrics = useMemo(() => {
    const covered = new Set(panelSeries.map((f) => f.refId).filter(Boolean));
    const uncovered: UncoveredMetric[] = [];

    // Node metrics
    nodes.forEach((node) => {
      node.metrics.forEach((m) => {
        if (m.datasourceUid && m.query && !covered.has(m.id)) {
          uncovered.push({
            metricId: m.id,
            dsUid: m.datasourceUid,
            query: m.query,
            dsType: m.datasourceType,
            queryConfig: m.queryConfig,
          });
        }
      });
    });

    // Edge metrics
    edges.forEach((edge) => {
      if (edge.metric?.datasourceUid && edge.metric?.query && !covered.has(edge.id)) {
        uncovered.push({
          metricId: edge.id,
          dsUid: edge.metric.datasourceUid,
          query: edge.metric.query,
        });
      }
    });

    return uncovered;
  }, [nodes, edges, panelSeries]);

  useEffect(() => {
    if (uncoveredMetrics.length === 0) {
      if (results.size > 0) {
        setResults(new Map());
      }
      return;
    }

    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
    }

    fetchTimerRef.current = setTimeout(async () => {
      const newResults = new Map<string, number | null>();

      // Query all uncovered metrics using the multi-DS abstraction
      const promises = uncoveredMetrics.map(async (m) => {
        const value = await queryDatasource(m.dsUid, m.query, m.dsType, m.queryConfig, replaceVars);
        newResults.set(m.metricId, value);
      });

      await Promise.all(promises);
      setResults(newResults);
    }, 500);

    return () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
    };
  }, [uncoveredMetrics, replaceVars]);

  return results;
}

export const TopologyPanel: React.FC<Props> = ({ options, onOptionsChange, data, width, height, replaceVariables }) => {
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [popupNodeId, setPopupNodeId] = useState<string | null>(null);

  const nodes = useMemo(() => options.nodes || [], [options.nodes]);
  const edges = useMemo(() => options.edges || [], [options.edges]);
  const groups = useMemo(() => options.groups || [], [options.groups]);
  const { canvas, animation, layout, display } = options;

  // Auto-fetch metrics not covered by panel queries (supports Prometheus, CloudWatch, Infinity)
  const selfQueryResults = useSelfQueries(nodes, edges, data.series, replaceVariables);

  // Ref to read current positions without triggering useEffect re-runs
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;

  // Initialize positions from node configs or auto-layout
  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }

    const currentPositions = nodePositionsRef.current;
    const allPositioned = nodes.every((n) => currentPositions.has(n.id));
    if (allPositioned) {
      return;
    }

    const positions = new Map<string, { x: number; y: number }>();
    let needsAutoLayout = false;

    nodes.forEach((node) => {
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

  // Compute runtime state from data frames + self-queried results
  const nodeStates = useMemo<Map<string, NodeRuntimeState>>(() => {
    const states = new Map<string, NodeRuntimeState>();

    nodes.forEach((node) => {
      const metricValues: Record<string, MetricValue> = {};
      let worstStatus: NodeStatus = node.metrics.length === 0 ? 'nodata' : 'ok';

      node.metrics.forEach((metricConfig) => {
        // Try panel data first
        const matchingFrame = data.series.find(
          (frame) => frame.refId === metricConfig.id || frame.name === metricConfig.label
        );

        let raw: number | null = null;
        let sparklineValues: number[] | undefined;

        if (matchingFrame && matchingFrame.fields.length > 1) {
          const valueField = matchingFrame.fields.find((f) => f.type === 'number');
          if (valueField && valueField.values.length > 0) {
            raw = valueField.values[valueField.values.length - 1] as number;
            if (metricConfig.showSparkline) {
              sparklineValues = Array.from(valueField.values).slice(-12) as number[];
            }
          }
        }

        // Fallback: try self-queried data
        if (raw === null && selfQueryResults.has(metricConfig.id)) {
          raw = selfQueryResults.get(metricConfig.id) ?? null;
        }

        if (raw !== null) {
          let status: 'ok' | 'warning' | 'critical' = 'ok';
          for (const t of [...metricConfig.thresholds].sort((a, b) => b.value - a.value)) {
            if (raw >= t.value) {
              status = t.color === 'red' ? 'critical' : t.color === 'yellow' ? 'warning' : 'ok';
              break;
            }
          }

          if (status === 'critical') {
            worstStatus = 'critical';
          } else if (status === 'warning' && worstStatus !== 'critical') {
            worstStatus = 'warning';
          }

          metricValues[metricConfig.id] = {
            raw,
            formatted: metricConfig.format.replace('${value}', formatNumber(raw)),
            status,
            sparklineData: sparklineValues,
          };
        }

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
  }, [nodes, data, expandedNodes, selfQueryResults]);

  // Compute health summary: worst status per node type for toolbar indicator
  const healthSummary = useMemo<Array<{ type: NodeType; icon: string; color: string; status: NodeStatus }>>(() => {
    const byType = new Map<NodeType, NodeStatus>();
    nodes.forEach((node) => {
      const state = nodeStates.get(node.id);
      const currentWorst = byType.get(node.type) || 'ok';
      if (state && isWorseStatus(state.status, currentWorst)) {
        byType.set(node.type, state.status);
      } else if (!byType.has(node.type)) {
        byType.set(node.type, state?.status || 'nodata');
      }
    });
    return Array.from(byType).map(([type, status]) => ({
      type,
      icon: NODE_TYPE_CONFIG[type]?.icon || '?',
      color: STATUS_COLORS[status] || '#4c566a',
      status,
    }));
  }, [nodes, nodeStates]);

  // Status propagation: find edges leading to critical nodes
  const propagatedEdgeIds = useMemo(() => {
    const statuses = new Map<string, NodeStatus>();
    nodeStates.forEach((state, id) => { statuses.set(id, state.status); });
    return propagateStatus(statuses, edges);
  }, [nodeStates, edges]);

  // Compute edge runtime state from data frames
  const edgeStates = useMemo<Map<string, EdgeRuntimeState>>(() => {
    const states = new Map<string, EdgeRuntimeState>();

    edges.forEach((edge) => {
      let value: number | null = null;

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

      // Fallback: try self-queried edge metric data
      if (value === null && selfQueryResults.has(edge.id)) {
        value = selfQueryResults.get(edge.id) ?? null;
      }

      const status = calculateEdgeStatus(value, edge.thresholds);
      // Apply status propagation: edges leading to critical nodes show degraded color
      const effectiveStatus = propagatedEdgeIds.has(edge.id) && status === 'healthy' ? 'degraded' : status;
      const color = getEdgeColor(effectiveStatus);
      const thickness = calculateThickness(value, edge.thicknessMode, edge.thicknessMin, edge.thicknessMax, edge.thresholds);
      const effectiveFlowSpeed = edge.flowSpeed || animation.defaultFlowSpeed || 'auto';
      const animationSpeed = animation.flowEnabled && edge.flowAnimation
        ? calculateFlowSpeed(value, effectiveFlowSpeed, edge.thresholds)
        : 0;

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
  }, [edges, data, animation.flowEnabled, animation.defaultFlowSpeed, selfQueryResults, propagatedEdgeIds]);

  // Persist positions
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

  const handleNodeToggle = useCallback((nodeId: string) => {
    const isEditMode = window.location.search.includes('editPanel');
    if (isEditMode) {
      // Canvas-sidebar sync: write selected node to options so editor can auto-expand it
      onOptionsChange({ ...options, _selectedNodeId: nodeId } as TopologyPanelOptions);
    } else {
      // View mode: toggle popup (click again to close)
      setPopupNodeId((prev) => (prev === nodeId ? null : nodeId));
    }
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) { next.delete(nodeId); } else { next.add(nodeId); }
      return next;
    });
  }, [options, onOptionsChange]);

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

  const handleLoadExample = useCallback(() => {
    const exampleTopology = getExampleTopology();
    onOptionsChange({ ...options, ...exampleTopology } as TopologyPanelOptions);
  }, [options, onOptionsChange]);

  const handleExpandAll = useCallback(() => {
    setExpandedNodes((prev) => {
      if (prev.size === nodes.length) { return new Set(); }
      return new Set(nodes.map((n) => n.id));
    });
  }, [nodes]);

  return (
    <div className="topology-panel" style={{ width, height }}>
      <div className="topology-toolbar">
        <span className="topology-title">E2E topology</span>
        {healthSummary.length > 0 && (
          <div className="topology-health-bar">
            {healthSummary.map((h) => (
              <span
                key={h.type}
                className="topology-health-dot"
                style={{ background: h.color }}
                title={`${h.icon} ${h.type}: ${h.status}`}
              />
            ))}
          </div>
        )}
        <div className="topology-toolbar-spacer" />
        <button className="topology-btn" onClick={handleResetLayout}>
          Auto layout
        </button>
        <button className="topology-btn" onClick={handleExpandAll}>
          {expandedNodes.size === nodes.length ? 'Collapse all' : 'Expand all'}
        </button>
        {nodes.length === 0 && (
          <button className="topology-btn" onClick={handleLoadExample}>
            Load example
          </button>
        )}
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
        height={height - 36}
        onNodeDrag={handleNodeDrag}
        onNodeToggle={handleNodeToggle}
      />
      {popupNodeId && (() => {
        const popupNode = nodes.find((n) => n.id === popupNodeId);
        const popupPos = nodePositions.get(popupNodeId);
        if (!popupNode || !popupPos) { return null; }
        return (
          <NodePopup
            node={popupNode}
            position={{ x: popupPos.x + (popupNode.width || 180) + 10, y: popupPos.y + 36 }}
            onClose={() => setPopupNodeId(null)}
          />
        );
      })()}
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
