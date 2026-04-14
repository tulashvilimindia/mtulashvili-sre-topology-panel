/**
 * panelEvents.ts — tiny cross-subtree pub/sub for the topology plugin
 *
 * The panel and its editor live in different React subtrees (the panel renders
 * inside Grafana's dashboard, the editor renders inside Grafana's panel-editor
 * chrome). React Context cannot cross this boundary. A module-level singleton
 * does.
 *
 * Used to let the canvas tell the sidebar NodesEditor "this node was clicked —
 * auto-expand its card" WITHOUT round-tripping through onOptionsChange (which
 * would dirty the dashboard JSON on every click).
 *
 * Keep this file tiny and focused. Add new event types only when absolutely
 * required.
 */

type NodeClickHandler = (nodeId: string) => void;

const nodeClickSubscribers = new Set<NodeClickHandler>();
const nodeEditRequestSubscribers = new Set<NodeClickHandler>();
const orphanEdgeCleanupSubscribers = new Set<NodeClickHandler>();

/**
 * Publish a node-clicked event to all subscribers.
 * Called by TopologyPanel when a node is clicked in edit mode.
 */
export function emitNodeClicked(nodeId: string): void {
  nodeClickSubscribers.forEach((handler) => {
    try {
      handler(nodeId);
    } catch (err) {
      console.warn('[topology] panelEvents handler threw', err);
    }
  });
}

/**
 * Subscribe to node-clicked events.
 * Returns an unsubscribe function — call it in your useEffect cleanup.
 */
export function onNodeClicked(handler: NodeClickHandler): () => void {
  nodeClickSubscribers.add(handler);
  return () => {
    nodeClickSubscribers.delete(handler);
  };
}

/**
 * Publish a node-edit-request event to all subscribers.
 * Called by TopologyPanel when a node is double-clicked. Semantically stronger
 * than a single click: "take me to this node in the editor" rather than "note
 * that I noticed this node." The NodesEditor subscriber scrolls the matching
 * card into view and expands it.
 */
export function emitNodeEditRequest(nodeId: string): void {
  nodeEditRequestSubscribers.forEach((handler) => {
    try {
      handler(nodeId);
    } catch (err) {
      console.warn('[topology] panelEvents edit-request handler threw', err);
    }
  });
}

/**
 * Subscribe to node-edit-request events.
 * Returns an unsubscribe function — call it in your useEffect cleanup.
 */
export function onNodeEditRequest(handler: NodeClickHandler): () => void {
  nodeEditRequestSubscribers.add(handler);
  return () => {
    nodeEditRequestSubscribers.delete(handler);
  };
}

/**
 * Publish an orphan-edge-cleanup event. NodesEditor fires this after deleting
 * a node so the TopologyPanel (which owns the full options including the edges
 * slice) can remove any edges that referenced the deleted node. NodesEditor
 * itself only has StandardEditorProps<TopologyNode[]> and can't reach the
 * edges slice directly.
 */
export function emitOrphanEdgeCleanup(deletedNodeId: string): void {
  orphanEdgeCleanupSubscribers.forEach((handler) => {
    try {
      handler(deletedNodeId);
    } catch (err) {
      console.warn('[topology] panelEvents orphan-cleanup handler threw', err);
    }
  });
}

/**
 * Subscribe to orphan-edge-cleanup events.
 * Returns an unsubscribe function — call it in your useEffect cleanup.
 */
export function onOrphanEdgeCleanup(handler: NodeClickHandler): () => void {
  orphanEdgeCleanupSubscribers.add(handler);
  return () => {
    orphanEdgeCleanupSubscribers.delete(handler);
  };
}
