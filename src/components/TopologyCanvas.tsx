import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import {
  TopologyNode, TopologyEdge, NodeGroup,
  NodeRuntimeState, EdgeRuntimeState, TopologyPanelOptions,
  NODE_TYPE_CONFIG, STATUS_COLORS
} from '../types';
import { getAnchorPoint, getBezierPath, getBezierMidpoint, EDGE_TYPE_STYLES } from '../utils/edges';
import { ViewportState, DEFAULT_VIEWPORT, zoomAtPoint, fitToView } from '../utils/viewport';
import { NodePopup } from './NodePopup';

interface CanvasProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  groups: NodeGroup[];
  nodePositions: Map<string, { x: number; y: number }>;
  nodeStates: Map<string, NodeRuntimeState>;
  edgeStates: Map<string, EdgeRuntimeState>;
  canvasOptions: TopologyPanelOptions['canvas'];
  animationOptions: TopologyPanelOptions['animation'];
  displayOptions: TopologyPanelOptions['display'];
  width: number;
  height: number;
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  onNodeToggle: (nodeId: string) => void;
  popupNode?: TopologyNode | null;
  popupPosition?: { x: number; y: number } | null;
  onPopupClose?: () => void;
}

export const TopologyCanvas: React.FC<CanvasProps> = ({
  nodes, edges, groups, nodePositions, nodeStates, edgeStates,
  canvasOptions, animationOptions, displayOptions,
  width, height, onNodeDrag, onNodeToggle,
  popupNode, popupPosition, onPopupClose
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeElRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragging, setDragging] = useState<{ nodeId: string; offX: number; offY: number } | null>(null);
  const hasMovedRef = useRef(false);

  // Viewport zoom/pan state
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // Mouse wheel zoom
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) {return;}
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      setViewport((prev) => zoomAtPoint(prev, e.deltaY, cursorX, cursorY));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Middle-mouse or Ctrl+drag pan
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      setIsPanning(true);
      const vp = viewportRef.current;
      panStartRef.current = { x: e.clientX, y: e.clientY, tx: vp.translateX, ty: vp.translateY };
      e.preventDefault();
    }
  }, []);

  useEffect(() => {
    if (!isPanning) {return;}
    const handleMove = (e: PointerEvent) => {
      if (!panStartRef.current) {return;}
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setViewport((prev) => ({ ...prev, translateX: panStartRef.current!.tx + dx, translateY: panStartRef.current!.ty + dy }));
    };
    const handleUp = () => { setIsPanning(false); panStartRef.current = null; };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => { document.removeEventListener('pointermove', handleMove); document.removeEventListener('pointerup', handleUp); };
  }, [isPanning]);

  // Fit-to-view: compute and set viewport to show all nodes
  const handleFitToView = useCallback(() => {
    const widths = new Map<string, number>();
    nodes.forEach((n) => { widths.set(n.id, n.width || (n.compact ? 110 : 180)); });
    setViewport(fitToView(nodePositions, widths, width, height));
  }, [nodePositions, nodes, width, height]);

  // Auto fit-to-view on first render (when nodes load for the first time)
  const prevNodeCountRef = useRef(0);
  useEffect(() => {
    if (prevNodeCountRef.current === 0 && nodes.length > 0) {
      setTimeout(handleFitToView, 100);
    }
    prevNodeCountRef.current = nodes.length;
  }, [nodes.length, handleFitToView]);

  const onNodeDragRef = useRef(onNodeDrag);
  onNodeDragRef.current = onNodeDrag;

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    const pos = nodePositions.get(nodeId);
    if (!pos) {return;}
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {return;}
    // Inverse-transform pointer coords by viewport for correct drag at any zoom level
    const vp = viewportRef.current;
    const scale = vp.scale || 1;
    const worldX = (e.clientX - rect.left - vp.translateX) / scale;
    const worldY = (e.clientY - rect.top - vp.translateY) / scale;
    setDragging({
      nodeId,
      offX: worldX - pos.x,
      offY: worldY - pos.y,
    });
    hasMovedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, [nodePositions]);

  useEffect(() => {
    if (!dragging) {return;}

    const handleMove = (e: PointerEvent) => {
      hasMovedRef.current = true;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {return;}
      // Inverse-transform pointer coords by viewport (use ref to avoid stale closure)
      const vp = viewportRef.current;
      const scale = vp.scale || 1;
      const worldX = (e.clientX - rect.left - vp.translateX) / scale;
      const worldY = (e.clientY - rect.top - vp.translateY) / scale;
      let x = worldX - dragging.offX;
      let y = worldY - dragging.offY;
      x = Math.max(0, Math.min(width / scale - 100, x));
      y = Math.max(0, Math.min(height / scale - 40, y));
      onNodeDragRef.current(dragging.nodeId, x, y);
    };

    const handleUp = () => setDragging(null);

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, width, height]);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!hasMovedRef.current) {
      onNodeToggle(nodeId);
    }
  }, [onNodeToggle]);

  // Get node rect for edge calculations (uses scoped ref map, not global DOM)
  const getNodeRect = (nodeId: string) => {
    const pos = nodePositions.get(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    if (!pos || !node) {return null;}
    const el = nodeElRefs.current.get(nodeId);
    const w = el?.offsetWidth || node.width || (node.compact ? 110 : 180);
    const h = el?.offsetHeight || (node.compact ? 60 : 90);
    return { x: pos.x, y: pos.y, w, h };
  };

  // Grid background
  const gridStyle = canvasOptions.showGrid ? {
    backgroundImage: `radial-gradient(circle at 1px 1px, #2d374833 1px, transparent 0)`,
    backgroundSize: `${canvasOptions.gridSize}px ${canvasOptions.gridSize}px`,
  } : {};

  return (
    <div
      ref={canvasRef}
      className="topology-canvas"
      style={{ width, height, position: 'relative', overflow: 'hidden', cursor: isPanning ? 'grabbing' : 'default', ...gridStyle }}
      onPointerDown={handleCanvasPointerDown}
    >
      {/* Viewport transform wrapper */}
      <div style={{ transform: `translate(${viewport.translateX}px, ${viewport.translateY}px) scale(${viewport.scale})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
      {/* SVG Layer for edges */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      >
        <defs>
          <marker id="topo-arrow-dim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M2 2L8 5L2 8" fill="none" stroke="#2d3748" strokeWidth="1.5" strokeLinecap="round" />
          </marker>
          <marker id="topo-arrow-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M2 2L8 5L2 8" fill="none" stroke="#a3be8c" strokeWidth="1.5" strokeLinecap="round" />
          </marker>
          <marker id="topo-arrow-warn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M2 2L8 5L2 8" fill="none" stroke="#ebcb8b" strokeWidth="1.5" strokeLinecap="round" />
          </marker>
          <marker id="topo-arrow-crit" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M2 2L8 5L2 8" fill="none" stroke="#bf616a" strokeWidth="1.5" strokeLinecap="round" />
          </marker>
          <marker id="topo-arrow-response" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M2 2L8 5L2 8" fill="none" stroke="#5e81ac" strokeWidth="1.5" strokeLinecap="round" />
          </marker>
        </defs>

        {/* Pre-compute parallel edge offsets */}
        {edges.map((edge, edgeIndex) => {
          const sourceRect = getNodeRect(edge.sourceId);
          const targetId = edge.targetId;
          if (!sourceRect || !targetId) {return null;}
          const targetRect = getNodeRect(targetId);
          if (!targetRect) {return null;}

          // Detect parallel edges: same source-target pair (either direction)
          const pairKey = [edge.sourceId, targetId].sort().join('-');
          const parallelEdges = edges.filter((e) => {
            if (!e.targetId) {return false;}
            const key = [e.sourceId, e.targetId].sort().join('-');
            return key === pairKey;
          });
          const parallelIndex = parallelEdges.indexOf(edge);
          const parallelOffset = parallelEdges.length > 1 ? (parallelIndex - (parallelEdges.length - 1) / 2) * 15 : 0;

          const fromRaw = getAnchorPoint(sourceRect, edge.anchorSource, targetRect);
          const toRaw = getAnchorPoint(targetRect, edge.anchorTarget, sourceRect);
          // Apply parallel offset perpendicular to edge direction
          const from = { x: fromRaw.x + parallelOffset, y: fromRaw.y };
          const to = { x: toRaw.x + parallelOffset, y: toRaw.y };
          const fwdPath = getBezierPath(from, to);
          const mid = getBezierMidpoint(from, to);

          const edgeStyle = EDGE_TYPE_STYLES[edge.type] || EDGE_TYPE_STYLES.traffic;
          const es = edgeStates.get(edge.id);
          const edgeColor = es?.color || STATUS_COLORS.nodata;
          const thickness = es?.thickness || edge.thicknessMin;
          const flowSpeed = es?.animationSpeed || 0;
          const label = es?.formattedLabel;

          const isResponse = edge.type === 'response';
          const arrowId = isResponse ? 'topo-arrow-response'
            : edgeColor === '#bf616a' ? 'topo-arrow-crit'
            : edgeColor === '#ebcb8b' ? 'topo-arrow-warn'
            : edgeColor === '#a3be8c' ? 'topo-arrow-ok'
            : 'topo-arrow-dim';
          // Response edges render from target→source (reverse direction)
          const renderFrom = isResponse ? to : from;
          const renderTo = isResponse ? from : to;

          const renderPath = getBezierPath(renderFrom, renderTo);
          const renderColor = isResponse ? '#5e81ac' : edgeColor;

          return (
            <g key={edge.id}>
              {/* Base wire */}
              <path
                d={renderPath}
                fill="none"
                stroke={isResponse ? '#2d374899' : '#2d3748'}
                strokeWidth={thickness}
                strokeDasharray={edgeStyle.dashArray}
                markerEnd={`url(#${arrowId})`}
              />
              {/* Animated flow overlay */}
              {flowSpeed > 0 && (
                <path
                  d={renderPath}
                  fill="none"
                  stroke={renderColor}
                  strokeWidth={Math.max(thickness + 1, 2.5)}
                  strokeDasharray="6 10"
                  opacity={isResponse ? 0.4 : 0.55}
                  style={{ animation: `topoFlow ${flowSpeed}s linear infinite` }}
                />
              )}
              {/* Bidirectional reverse path */}
              {edge.bidirectional && (
                <>
                  <path
                    d={getBezierPath(to, from)}
                    fill="none"
                    stroke="#2d3748"
                    strokeWidth={thickness}
                    strokeDasharray={edgeStyle.dashArray}
                    markerEnd={`url(#${arrowId})`}
                    opacity={0.5}
                  />
                  {flowSpeed > 0 && (
                    <path
                      d={getBezierPath(to, from)}
                      fill="none"
                      stroke={edgeColor}
                      strokeWidth={Math.max(thickness + 1, 2.5)}
                      strokeDasharray="6 10"
                      opacity={0.35}
                      style={{ animation: `topoFlow ${flowSpeed}s linear infinite` }}
                    />
                  )}
                </>
              )}
              {/* Edge label */}
              {displayOptions.showEdgeLabels && label && (
                <text
                  x={mid.x}
                  y={mid.y - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#5e81ac"
                  fontFamily="var(--font-sans)"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Group containers */}
      {groups.map((group) => {
        const memberPositions = group.nodeIds
          .map((id) => {
            const pos = nodePositions.get(id);
            const node = nodes.find((n) => n.id === id);
            if (!pos || !node) {return null;}
            const w = node.width || (node.compact ? 110 : 180);
            const h = 90;
            return { x: pos.x, y: pos.y, w, h };
          })
          .filter(Boolean) as Array<{ x: number; y: number; w: number; h: number }>;

        if (memberPositions.length === 0) {return null;}

        const padding = 15;
        const minX = Math.min(...memberPositions.map((p) => p.x)) - padding;
        const minY = Math.min(...memberPositions.map((p) => p.y)) - padding - 10;
        const maxX = Math.max(...memberPositions.map((p) => p.x + p.w)) + padding;
        const maxY = Math.max(...memberPositions.map((p) => p.y + p.h)) + padding;

        return (
          <div
            key={group.id}
            className="topology-group"
            style={{
              position: 'absolute',
              left: minX,
              top: minY,
              width: maxX - minX,
              height: maxY - minY,
              border: group.style === 'dashed' ? '1px dashed #2d374866' : '1px solid #2d374844',
              borderRadius: 10,
              zIndex: 1,
              pointerEvents: 'none',
            }}
          >
            <span className="topology-group-label">{group.label}</span>
          </div>
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const pos = nodePositions.get(node.id);
        if (!pos) {return null;}
        const state = nodeStates.get(node.id);
        const typeConfig = NODE_TYPE_CONFIG[node.type];
        const isExpanded = state?.expanded || false;
        const isDragging = dragging?.nodeId === node.id;
        const status = state?.status || 'unknown';

        const summaryMetrics = node.metrics.filter((m) => m.isSummary).slice(0, displayOptions.maxSummaryMetrics);
        const expandedMetrics = node.metrics.filter((m) => !m.isSummary);
        const sections = [...new Set(expandedMetrics.map((m) => m.section))];

        return (
          <div
            key={node.id}
            ref={(el) => { if (el) {nodeElRefs.current.set(node.id, el);} else {nodeElRefs.current.delete(node.id);} }}
            className={`topology-node ${node.compact ? 'compact' : ''} st-${status} ${isExpanded ? 'open' : ''} ${isDragging ? 'dragging' : ''}`}
            role="button"
            aria-label={`${node.name} (${node.type}): ${status}`}
            title={node.name}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: node.width || (node.compact ? 110 : 180),
              zIndex: isDragging ? 10 : 2,
            }}
            onPointerDown={(e) => handlePointerDown(e, node.id)}
            onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
          >
            {/* Header */}
            <div className="topo-node-header">
              <div
                className="topo-node-icon"
                style={{ background: typeConfig.color + '22', color: typeConfig.color }}
              >
                {node.iconOverride || typeConfig.icon}
              </div>
              <div className="topo-node-info">
                <div className="topo-node-name">{node.name}</div>
                {node.role && <div className="topo-node-role">{node.role}</div>}
              </div>
              {displayOptions.showNodeStatus && (
                <div className={`topo-node-dot ${status}${status === 'critical' && !animationOptions.pulseOnCritical ? ' no-pulse' : ''}`} />
              )}
            </div>

            {/* Summary metrics (always visible) */}
            <div className="topo-node-metrics">
              {summaryMetrics.map((metric) => {
                const val = state?.metricValues[metric.id];
                return (
                  <div key={metric.id} className="topo-metric">
                    <div className="topo-metric-label">{metric.label}</div>
                    <div className={`topo-metric-value ${val?.status || 'unknown'}`}>
                      {val?.formatted || 'N/A'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Expand hint */}
            {expandedMetrics.length > 0 && !isExpanded && (
              <div className="topo-node-hint">click to expand</div>
            )}

            {/* Expanded metrics */}
            {expandedMetrics.length > 0 && (
              <div className="topo-node-expanded">
                <div className="topo-node-expanded-inner">
                  {sections.map((section) => (
                    <React.Fragment key={section}>
                      <div className="topo-exp-section">{section}</div>
                      <div className="topo-exp-row">
                        {expandedMetrics
                          .filter((m) => m.section === section)
                          .map((metric) => {
                            const val = state?.metricValues[metric.id];
                            return (
                              <div key={metric.id} className="topo-metric">
                                <div className="topo-metric-label">{metric.label}</div>
                                <div className={`topo-metric-value ${val?.status || 'unknown'}`}>
                                  {val?.formatted || 'N/A'}
                                </div>
                                {val?.sparklineData && (
                                  <div className="topo-sparkline">
                                    {val.sparklineData.map((v, i) => (
                                      <div
                                        key={i}
                                        className="topo-spark-bar"
                                        style={{
                                          height: `${Math.max(5, (v / Math.max(...val.sparklineData!, 1)) * 100)}%`,
                                          background: STATUS_COLORS[val.status] || '#5e81ac',
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>{/* end viewport transform wrapper */}
      {/* Popup rendered in TopologyPanel instead (outside canvas overflow:hidden) */}
      {/* Zoom controls overlay */}
      <div style={{ position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 3, zIndex: 20 }}>
        <button className="topology-btn" onClick={handleFitToView} title="Fit to view">Fit</button>
        <button className="topology-btn" onClick={() => setViewport(DEFAULT_VIEWPORT)} title="Reset zoom">1:1</button>
      </div>
    </div>
  );
};
