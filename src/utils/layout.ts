import { TopologyNode, TopologyEdge } from '../types';

interface LayoutConfig {
  direction: 'top-down' | 'left-right';
  tierSpacing: number;
  nodeSpacing: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Compute tier assignments for nodes based on edge relationships.
 * Uses topological sort — nodes with no incoming edges are tier 0.
 * Skips bidirectional/back-edges to prevent cycles (HA sync edges).
 */
export function assignTiers(nodes: TopologyNode[], edges: TopologyEdge[]): Map<string, number> {
  const tiers = new Map<string, number>();
  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Initialize
  nodes.forEach((n) => {
    incomingCount.set(n.id, 0);
    outgoing.set(n.id, []);
  });

  // Build DAG — skip bidirectional edges and filter to only edges between known nodes
  // Also detect and skip back-edges that would create cycles
  const forwardEdges = new Set<string>();
  edges.forEach((e) => {
    if (!e.targetId || !nodeIds.has(e.sourceId) || !nodeIds.has(e.targetId)) {
      return;
    }
    // Skip bidirectional edges — they represent peer relationships (HA sync), not hierarchy
    if (e.bidirectional) {
      return;
    }
    // Skip if a reverse edge was already registered (prevents A→B + B→A cycles)
    const reverseKey = `${e.targetId}->${e.sourceId}`;
    if (forwardEdges.has(reverseKey)) {
      return;
    }
    const forwardKey = `${e.sourceId}->${e.targetId}`;
    forwardEdges.add(forwardKey);

    incomingCount.set(e.targetId, (incomingCount.get(e.targetId) || 0) + 1);
    const out = outgoing.get(e.sourceId) || [];
    out.push(e.targetId);
    outgoing.set(e.sourceId, out);
  });

  // BFS from roots (no incoming)
  const queue: string[] = [];
  nodes.forEach((n) => {
    if ((incomingCount.get(n.id) || 0) === 0) {
      queue.push(n.id);
      tiers.set(n.id, 0);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentTier = tiers.get(current) || 0;
    const children = outgoing.get(current) || [];

    children.forEach((childId) => {
      const existingTier = tiers.get(childId);
      const newTier = currentTier + 1;
      if (existingTier === undefined || newTier > existingTier) {
        tiers.set(childId, newTier);
      }
      const remaining = (incomingCount.get(childId) || 1) - 1;
      incomingCount.set(childId, remaining);
      if (remaining <= 0) {
        queue.push(childId);
      }
    });
  }

  // Assign unconnected nodes to tier 0
  nodes.forEach((n) => {
    if (!tiers.has(n.id)) {
      tiers.set(n.id, 0);
    }
  });

  return tiers;
}

/**
 * Auto-layout nodes in a tiered arrangement
 */
export function autoLayout(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  config: LayoutConfig
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const tiers = assignTiers(nodes, edges);

  // Group nodes by tier
  const tierGroups = new Map<number, TopologyNode[]>();
  nodes.forEach((n) => {
    const tier = tiers.get(n.id) || 0;
    if (!tierGroups.has(tier)) {
      tierGroups.set(tier, []);
    }
    tierGroups.get(tier)!.push(n);
  });

  // Sort tier numbers
  const sortedTiers = [...tierGroups.keys()].sort((a, b) => a - b);

  // Position each tier — compute total width/height from actual node dimensions
  sortedTiers.forEach((tierNum, tierIndex) => {
    const nodesInTier = tierGroups.get(tierNum)!;
    const nodeCount = nodesInTier.length;
    const nodeWidths = nodesInTier.map((n) => n.width || (n.compact ? 110 : 180));

    if (config.direction === 'top-down') {
      const totalWidth = nodeWidths.reduce((sum, w) => sum + w, 0) + (nodeCount - 1) * config.nodeSpacing;
      const startX = Math.max(20, (config.canvasWidth - totalWidth) / 2);
      let xCursor = startX;

      nodesInTier.forEach((node, nodeIndex) => {
        positions.set(node.id, {
          x: xCursor,
          y: 30 + tierIndex * config.tierSpacing,
        });
        xCursor += nodeWidths[nodeIndex] + config.nodeSpacing;
      });
    } else {
      // Left-right layout
      const totalHeight = nodeCount * 80 + (nodeCount - 1) * config.nodeSpacing;
      const startY = Math.max(20, (config.canvasHeight - totalHeight) / 2);

      nodesInTier.forEach((node, nodeIndex) => {
        positions.set(node.id, {
          x: 30 + tierIndex * config.tierSpacing,
          y: startY + nodeIndex * (80 + config.nodeSpacing),
        });
      });
    }
  });

  return positions;
}

/**
 * Snap a position to the nearest grid point
 */
export function snapToGrid(x: number, y: number, gridSize: number): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}
