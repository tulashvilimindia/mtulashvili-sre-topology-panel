import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { PanelProps, DataFrame } from '@grafana/data';
import { TopologyPanelOptions, TopologyNode, TopologyEdge, NodeRuntimeState, NodeStatus, NodeType, EdgeRuntimeState, MetricValue, NodeMetricConfig, DatasourceQueryConfig, FiringAlert, NODE_TYPE_CONFIG, STATUS_COLORS } from '../types';
import { TopologyCanvas } from './TopologyCanvas';
import { autoLayout } from '../utils/layout';
import { calculateEdgeStatus, getEdgeColor, calculateThickness, calculateFlowSpeed, isWorseStatus, propagateStatus } from '../utils/edges';
import { queryDatasource, QueryResult, QueryError } from '../utils/datasourceQuery';
import { fetchAlertRules, matchAlertsToNode } from '../utils/alertRules';
import { emitNodeClicked } from '../utils/panelEvents';
import { getExampleTopology } from '../editors/exampleTopology';
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
  replaceVars?: (value: string) => string,
  historicalTime?: number
): { data: Map<string, QueryResult>; isLoading: boolean; failures: Map<string, QueryError> } {
  const [results, setResults] = useState<Map<string, QueryResult>>(new Map());
  const [failures, setFailures] = useState<Map<string, QueryError>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
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

  // Track whether results exist via ref to avoid adding results to deps (which causes infinite loop)
  const hasResultsRef = useRef(false);
  hasResultsRef.current = results.size > 0;

  useEffect(() => {
    if (uncoveredMetrics.length === 0) {
      if (hasResultsRef.current) {
        setResults(new Map());
        setFailures(new Map());
      }
      return;
    }

    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
    }

    fetchTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      const newResults = new Map<string, QueryResult>();
      const newFailures = new Map<string, QueryError>();

      // Query all uncovered metrics using the multi-DS abstraction
      const promises = uncoveredMetrics.map(async (m) => {
        const result = await queryDatasource(m.dsUid, m.query, m.dsType, m.queryConfig, replaceVars, historicalTime);
        newResults.set(m.metricId, result);
        if (result.error) {
          newFailures.set(m.metricId, result.error);
        }
      });

      await Promise.all(promises);
      setResults(newResults);
      setFailures(newFailures);
      setIsLoading(false);
    }, 500);

    return () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
    };
  }, [uncoveredMetrics, replaceVars, historicalTime]);

  return { data: results, isLoading, failures };
}

// ─── Auto-fetch: poll Grafana unified alerting API and match alerts to nodes ───
function useAlertRules(nodes: TopologyNode[]): Map<string, FiringAlert[]> {
  const [alertsByNode, setAlertsByNode] = useState<Map<string, FiringAlert[]>>(new Map());

  // Only nodes opted-in via alertLabelMatchers trigger polling
  const nodesWithMatchers = useMemo(
    () => nodes.filter((n) => n.alertLabelMatchers && Object.keys(n.alertLabelMatchers).length > 0),
    [nodes]
  );

  // Avoid adding alertsByNode to deps (would cause infinite loop)
  const hasAlertsRef = useRef(false);
  hasAlertsRef.current = alertsByNode.size > 0;

  useEffect(() => {
    if (nodesWithMatchers.length === 0) {
      if (hasAlertsRef.current) {
        setAlertsByNode(new Map());
      }
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const result = await fetchAlertRules(controller.signal);
        if (cancelled) {
          return;
        }
        const next = new Map<string, FiringAlert[]>();
        nodesWithMatchers.forEach((n) => {
          const matched = matchAlertsToNode(result.alerts, n.alertLabelMatchers);
          if (matched.length > 0) {
            next.set(n.id, matched);
          }
        });
        setAlertsByNode(next);
      } catch (err) {
        // AbortError is intentional cleanup — swallow silently
        if ((err as Error).name !== 'AbortError') {
          console.warn('[topology] useAlertRules run failed', err);
        }
      }
    };

    run();
    const interval = setInterval(run, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      controller.abort();
    };
  }, [nodesWithMatchers]);

  return alertsByNode;
}

export const TopologyPanel: React.FC<Props> = ({ options, onOptionsChange, data, width, height, replaceVariables }) => {
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [popupNodeId, setPopupNodeId] = useState<string | null>(null);
  const [timeOffset, setTimeOffset] = useState<number>(0); // 0 = now, negative = minutes ago

  const nodes = useMemo(() => options.nodes || [], [options.nodes]);
  const edges = useMemo(() => options.edges || [], [options.edges]);
  const groups = useMemo(() => options.groups || [], [options.groups]);
  const { canvas, animation, layout, display } = options;

  // Refs for stable closures in debounced/callback functions (CR-6, CR-7)
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Time travel: compute historical timestamp (0 = now/live)
  const historicalTime = useMemo(() => {
    if (timeOffset === 0) {
      return undefined;
    }
    return Math.floor(Date.now() / 1000) + timeOffset * 60;
  }, [timeOffset]);

  // Auto-fetch metrics not covered by panel queries (supports Prometheus, CloudWatch, Infinity)
  const { data: selfQueryResults, isLoading: isFetchingMetrics, failures: selfQueryFailures } = useSelfQueries(nodes, edges, data.series, replaceVariables, historicalTime);

  // Auto-fetch Grafana alert rules and match to nodes (only polls if ≥1 node has alertLabelMatchers)
  const alertsByNode = useAlertRules(nodes);

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

    // Honor the layout.autoLayout toggle: when false, use stored node.position
    // directly for every node — even default (100,100) — and skip auto-layout.
    if (!layout.autoLayout) {
      const positions = new Map<string, { x: number; y: number }>();
      nodes.forEach((node) => {
        const existing = currentPositions.get(node.id);
        positions.set(node.id, existing || { ...node.position });
      });
      setNodePositions(positions);
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
          raw = selfQueryResults.get(metricConfig.id)?.value ?? null;
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
            formatted: formatMetricValue(raw, metricConfig.format),
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

      // Alert-rule override: firing → critical, pending → warning (unless already critical)
      const matched = alertsByNode.get(node.id);
      let firingAlerts: FiringAlert[] | undefined;
      if (matched && matched.length > 0) {
        firingAlerts = matched;
        const hasFiring = matched.some((a) => a.state === 'firing');
        const hasPending = matched.some((a) => a.state === 'pending');
        if (hasFiring) {
          worstStatus = 'critical';
        } else if (hasPending && (worstStatus as NodeStatus) !== 'critical') {
          worstStatus = 'warning';
        }
      }

      states.set(node.id, {
        nodeId: node.id,
        status: worstStatus,
        metricValues,
        expanded: expandedNodes.has(node.id),
        firingAlerts,
      });
    });

    return states;
  }, [nodes, data, expandedNodes, selfQueryResults, alertsByNode]);

  // Compute health summary: worst status per node type for toolbar indicator
  const healthSummary = useMemo<Array<{ type: NodeType; icon: string; color: string; status: NodeStatus; count: number }>>(() => {
    const byType = new Map<NodeType, { status: NodeStatus; count: number }>();
    nodes.forEach((node) => {
      const state = nodeStates.get(node.id);
      const current = byType.get(node.type) || { status: 'ok' as NodeStatus, count: 0 };
      current.count++;
      if (state && isWorseStatus(state.status, current.status)) {
        current.status = state.status;
      } else if (current.count === 1 && !state) {
        current.status = 'nodata';
      }
      byType.set(node.type, current);
    });
    return Array.from(byType).map(([type, data]) => ({
      type,
      icon: NODE_TYPE_CONFIG[type]?.icon || '?',
      color: STATUS_COLORS[data.status] || '#4c566a',
      status: data.status,
      count: data.count,
    }));
  }, [nodes, nodeStates]);

  // Derive stale-metric summary for toolbar pill
  const failureSummary = useMemo(() => {
    const byError: Record<QueryError, number> = { network: 0, http: 0, parse: 0 };
    const ids: string[] = [];
    selfQueryFailures.forEach((err, id) => {
      byError[err]++;
      ids.push(`${id} (${err})`);
    });
    return { total: selfQueryFailures.size, byError, ids };
  }, [selfQueryFailures]);

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
        value = selfQueryResults.get(edge.id)?.value ?? null;
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
          formattedLabel = formatMetricValue(value, edge.labelTemplate);
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
  // Cleanup persist timer on unmount
  useEffect(() => {
    return () => { if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); } };
  }, []);
  const persistPositions = useCallback((positions: Map<string, { x: number; y: number }>) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      const currentNodes = nodesRef.current;
      const currentOptions = optionsRef.current;
      const updatedNodes = currentNodes.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
      onOptionsChange({ ...currentOptions, nodes: updatedNodes });
    }, 300);
  }, [onOptionsChange]);

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
      // Canvas-sidebar sync via module-level event emitter — no options roundtrip,
      // no dashboard-dirty side effects, works across the panel/editor React subtree boundary.
      emitNodeClicked(nodeId);
    } else {
      // View mode: toggle popup (click again to close)
      setPopupNodeId((prev) => (prev === nodeId ? null : nodeId));
    }
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) { next.delete(nodeId); } else { next.add(nodeId); }
      return next;
    });
  }, []);

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
    <div className="topology-panel" style={{ width, height, backgroundColor: canvas.backgroundColor }} onClick={() => setPopupNodeId(null)}>
      <div className="topology-toolbar">
        <span className="topology-title">E2E topology</span>
        {isFetchingMetrics && <span style={{ fontSize: 9, color: '#616e88', marginLeft: 6 }}>Loading...</span>}
        {healthSummary.length > 0 && (
          <div className="topology-health-bar">
            {healthSummary.map((h) => (
              <span
                key={h.type}
                className="topology-health-dot"
                style={{ background: h.color }}
                title={`${h.icon} ${h.type} (${h.count}): ${h.status}`}
              />
            ))}
          </div>
        )}
        {failureSummary.total > 0 && (
          <span
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 3,
              background: '#ebcb8b22',
              color: '#ebcb8b',
              border: '1px solid #ebcb8b44',
              marginLeft: 6,
              whiteSpace: 'nowrap',
              cursor: 'help',
            }}
            title={`Stale metrics (${failureSummary.total}):\n${failureSummary.ids.join('\n')}`}
          >
            ⚠ {failureSummary.total} stale
          </span>
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
        <select
          className="topology-btn"
          value={timeOffset}
          onChange={(e) => setTimeOffset(parseInt(e.target.value, 10))}
          title="Time travel: view topology at a past time"
        >
          <option value={0}>Live</option>
          <option value={-5}>5m ago</option>
          <option value={-15}>15m ago</option>
          <option value={-30}>30m ago</option>
          <option value={-60}>1h ago</option>
          <option value={-180}>3h ago</option>
          <option value={-360}>6h ago</option>
          <option value={-1440}>24h ago</option>
        </select>
      </div>
      {timeOffset !== 0 && (
        <div className="topology-time-banner">
          <span>Viewing: {Math.abs(timeOffset) >= 60 ? Math.abs(timeOffset) / 60 + 'h' : Math.abs(timeOffset) + 'm'} ago</span>
          <button className="topology-btn" onClick={() => setTimeOffset(0)}>Back to Live</button>
        </div>
      )}
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
        height={height - 36 - (timeOffset !== 0 ? 28 : 0)}
        onNodeDrag={handleNodeDrag}
        onNodeToggle={handleNodeToggle}
      />
      {popupNodeId && (() => {
        const popupNode = nodes.find((n) => n.id === popupNodeId);
        if (!popupNode) { return null; }
        const popupAlerts = nodeStates.get(popupNodeId)?.firingAlerts;
        return (
          <div style={{ position: 'absolute', top: 44, right: 8, zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
            <NodePopup
              node={popupNode}
              firingAlerts={popupAlerts}
              onClose={() => setPopupNodeId(null)}
            />
          </div>
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

/** Format seconds as human-readable duration */
function formatDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs >= 86400) {
    return (seconds / 86400).toFixed(1) + 'd';
  }
  if (abs >= 3600) {
    return (seconds / 3600).toFixed(1) + 'h';
  }
  if (abs >= 60) {
    return (seconds / 60).toFixed(1) + 'm';
  }
  return seconds.toFixed(1) + 's';
}

/** Format a metric value using its format template, with time-unit detection */
/**
 * Format a metric value using its format template.
 * XSS safety: React JSX auto-escapes rendered text. The format.replace(<>) guard
 * prevents angle brackets from appearing even if rendered outside React in the future.
 */
function formatMetricValue(raw: number, format: string): string {
  const safeFormat = format.replace(/[<>]/g, '');
  // Detect time-unit format templates: "${value}s", "${value}ms", "${value}m", "${value}h"
  const timeMatch = safeFormat.match(/\$\{value\}(ms|s|m|h)$/);
  if (timeMatch) {
    const unit = timeMatch[1];
    let seconds = raw;
    if (unit === 'ms') {
      seconds = raw / 1000;
    } else if (unit === 'm') {
      seconds = raw * 60;
    } else if (unit === 'h') {
      seconds = raw * 3600;
    }
    return formatDuration(seconds);
  }
  return safeFormat.replace('${value}', formatNumber(raw));
}
