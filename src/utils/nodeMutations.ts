/**
 * nodeMutations.ts — pure, immutable node mutation helpers for canvas
 * click-ops context menu actions.
 *
 * Scope: only single-field mutations that do NOT have sidebar local-
 * state mirrors. Fields with mirrors (alertLabelMatchers,
 * observabilityLinks, metric config) are edited exclusively via the
 * sidebar NodeCard — click-ops for those features redirect to the
 * sidebar via section-targeted emitNodeEditRequest events rather than
 * mutating here, to avoid silent desync with an open card's local
 * state.
 *
 * Every helper takes the current TopologyPanelOptions and returns a
 * new object — never mutates.
 */
import { TopologyPanelOptions, NodeType } from '../types';

/**
 * Change a node's type. Returns options unchanged when the node does
 * not exist. Does not touch any other node field (role, metrics, etc.).
 */
export function setNodeType(
  options: TopologyPanelOptions,
  nodeId: string,
  newType: NodeType
): TopologyPanelOptions {
  const nodes = options.nodes || [];
  const idx = nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return options;
  }
  const nextNodes = nodes.map((n, i) => (i === idx ? { ...n, type: newType } : n));
  return { ...options, nodes: nextNodes };
}

/**
 * Toggle a node's compact flag. Returns options unchanged when the node
 * does not exist.
 */
export function toggleNodeCompact(
  options: TopologyPanelOptions,
  nodeId: string
): TopologyPanelOptions {
  const nodes = options.nodes || [];
  const idx = nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return options;
  }
  const nextNodes = nodes.map((n, i) => (i === idx ? { ...n, compact: !n.compact } : n));
  return { ...options, nodes: nextNodes };
}
