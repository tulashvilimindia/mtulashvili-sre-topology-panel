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
