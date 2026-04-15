/**
 * nodeMutations.ts — pure, immutable mutation helpers for TopologyNode
 * operations triggered from the canvas click-ops context menu.
 *
 * Every helper takes the current TopologyPanelOptions and returns a new
 * object — never mutates. All callers go through TopologyPanel's
 * onOptionsChange so the same mutation path used by the sidebar editors
 * applies here.
 *
 * Intentional scope: these helpers ONLY touch fields that do NOT have
 * sidebar local-state mirrors (type, compact, groupId). Fields like
 * alertLabelMatchers and observabilityLinks are edited via mirrored
 * local state in NodeCard.tsx — click-ops helpers must not touch them
 * or a silent desync is possible when a node card is open.
 */
import { TopologyPanelOptions, TopologyEdge, NodeType, DEFAULT_EDGE, NodeGroup } from '../types';
import { generateId } from '../editors/utils/editorUtils';

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

/**
 * Add a node to a group, removing it from any other group first (a node
 * can only belong to one group at a time in the topology model).
 *
 * - Returns options unchanged when the group does not exist.
 * - Idempotent: adding a node to a group it is already in is a no-op.
 * - Removes the node from any other group BEFORE adding it to the new one.
 */
export function addNodeToGroup(
  options: TopologyPanelOptions,
  nodeId: string,
  groupId: string
): TopologyPanelOptions {
  const groups = options.groups || [];
  const targetIdx = groups.findIndex((g) => g.id === groupId);
  if (targetIdx === -1) {
    return options;
  }
  // Idempotent check
  if (groups[targetIdx].nodeIds.includes(nodeId)) {
    return options;
  }
  const nextGroups: NodeGroup[] = groups.map((g, i) => {
    if (i === targetIdx) {
      return { ...g, nodeIds: [...g.nodeIds, nodeId] };
    }
    // Remove from any other group
    if (g.nodeIds.includes(nodeId)) {
      return { ...g, nodeIds: g.nodeIds.filter((id) => id !== nodeId) };
    }
    return g;
  });
  return { ...options, groups: nextGroups };
}

/**
 * Remove a node from whatever group it currently belongs to. No-op if
 * the node is not in any group.
 */
export function removeNodeFromGroup(
  options: TopologyPanelOptions,
  nodeId: string
): TopologyPanelOptions {
  const groups = options.groups || [];
  let touched = false;
  const nextGroups: NodeGroup[] = groups.map((g) => {
    if (g.nodeIds.includes(nodeId)) {
      touched = true;
      return { ...g, nodeIds: g.nodeIds.filter((id) => id !== nodeId) };
    }
    return g;
  });
  if (!touched) {
    return options;
  }
  return { ...options, groups: nextGroups };
}

/**
 * Create a new edge between two nodes with DEFAULT_EDGE settings. Used
 * by the "Connect to ▸" click-ops submenu.
 *
 * Guards:
 * - Both sourceId and targetId must exist in options.nodes
 * - sourceId !== targetId (no self-loops)
 * - Neither endpoint may be a virtual (runtime-only) node
 *
 * When any guard fails, returns options unchanged and newEdgeId = null.
 *
 * The newEdgeId parameter is optional — callers can pass a fixed id for
 * test determinism; production callers let it default to generateId('e').
 */
export function createEdgeBetween(
  options: TopologyPanelOptions,
  sourceId: string,
  targetId: string,
  newEdgeId: string = generateId('e')
): { options: TopologyPanelOptions; newEdgeId: string | null } {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { options, newEdgeId: null };
  }
  const nodes = options.nodes || [];
  const source = nodes.find((n) => n.id === sourceId);
  const target = nodes.find((n) => n.id === targetId);
  if (!source || !target) {
    return { options, newEdgeId: null };
  }
  if (source._virtual || target._virtual) {
    return { options, newEdgeId: null };
  }
  const newEdge: TopologyEdge = {
    ...(DEFAULT_EDGE as TopologyEdge),
    id: newEdgeId,
    sourceId,
    targetId,
  };
  const nextEdges = [...(options.edges || []), newEdge];
  return { options: { ...options, edges: nextEdges }, newEdgeId };
}
