/**
 * edgeMutations.ts — pure, immutable mutation helpers for TopologyEdge
 * operations triggered from the canvas click-ops context menu.
 *
 * Same invariants as nodeMutations.ts: every helper returns a new
 * options object without mutating the input. Only fields that do NOT
 * have sidebar local-state mirrors are safe to mutate here (type,
 * bidirectional, flowAnimation, flowSpeed, anchorSource, anchorTarget).
 * Fields like metric.query, thresholds, and stateMap are edited via
 * mirrored local state in EdgeCard.tsx — click-ops helpers must leave
 * those alone to avoid silent desync with an open edge card.
 */
import { TopologyPanelOptions, EdgeType, FlowSpeed, AnchorPoint } from '../types';

/**
 * Change an edge's visual type (traffic / ha_sync / failover / monitor /
 * response / custom). Returns options unchanged when the edge does not
 * exist. Does not touch thresholds, metric, or state map.
 */
export function setEdgeType(
  options: TopologyPanelOptions,
  edgeId: string,
  newType: EdgeType
): TopologyPanelOptions {
  const edges = options.edges || [];
  const idx = edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) {
    return options;
  }
  const nextEdges = edges.map((e, i) => (i === idx ? { ...e, type: newType } : e));
  return { ...options, edges: nextEdges };
}

/**
 * Toggle an edge's bidirectional flag. Returns options unchanged when
 * the edge does not exist.
 */
export function toggleEdgeBidirectional(
  options: TopologyPanelOptions,
  edgeId: string
): TopologyPanelOptions {
  const edges = options.edges || [];
  const idx = edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) {
    return options;
  }
  const nextEdges = edges.map((e, i) =>
    i === idx ? { ...e, bidirectional: !e.bidirectional } : e
  );
  return { ...options, edges: nextEdges };
}

/**
 * Toggle an edge's flowAnimation flag. Returns options unchanged when
 * the edge does not exist.
 */
export function toggleEdgeFlowAnimation(
  options: TopologyPanelOptions,
  edgeId: string
): TopologyPanelOptions {
  const edges = options.edges || [];
  const idx = edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) {
    return options;
  }
  const nextEdges = edges.map((e, i) =>
    i === idx ? { ...e, flowAnimation: !e.flowAnimation } : e
  );
  return { ...options, edges: nextEdges };
}

/**
 * Set an edge's flow speed (auto / slow / normal / fast / none) or
 * clear it (undefined = inherit from animation.defaultFlowSpeed).
 * Returns options unchanged when the edge does not exist.
 */
export function setEdgeFlowSpeed(
  options: TopologyPanelOptions,
  edgeId: string,
  newSpeed: FlowSpeed | undefined
): TopologyPanelOptions {
  const edges = options.edges || [];
  const idx = edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) {
    return options;
  }
  const nextEdges = edges.map((e, i) => (i === idx ? { ...e, flowSpeed: newSpeed } : e));
  return { ...options, edges: nextEdges };
}

/**
 * Set an edge's source-side or target-side anchor point. Returns
 * options unchanged when the edge does not exist.
 */
export function setEdgeAnchor(
  options: TopologyPanelOptions,
  edgeId: string,
  side: 'source' | 'target',
  anchor: AnchorPoint
): TopologyPanelOptions {
  const edges = options.edges || [];
  const idx = edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) {
    return options;
  }
  const field = side === 'source' ? 'anchorSource' : 'anchorTarget';
  const nextEdges = edges.map((e, i) => (i === idx ? { ...e, [field]: anchor } : e));
  return { ...options, edges: nextEdges };
}
