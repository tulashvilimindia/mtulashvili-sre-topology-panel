import {
  setNodeType,
  toggleNodeCompact,
  addNodeToGroup,
  removeNodeFromGroup,
  createEdgeBetween,
} from '../nodeMutations';
import { TopologyPanelOptions, TopologyNode, NodeGroup, DEFAULT_PANEL_OPTIONS } from '../../types';

// ─── Fixture builders ─────────────────────────────────────────────────

function node(overrides: Partial<TopologyNode> = {}): TopologyNode {
  return {
    id: 'n-test',
    name: 'test',
    role: '',
    type: 'server',
    metrics: [],
    position: { x: 0, y: 0 },
    compact: false,
    ...overrides,
  };
}

function group(overrides: Partial<NodeGroup> = {}): NodeGroup {
  return {
    id: 'g-test',
    label: 'Test Group',
    type: 'custom',
    nodeIds: [],
    style: 'dashed',
    ...overrides,
  };
}

function opts(overrides: Partial<TopologyPanelOptions> = {}): TopologyPanelOptions {
  return {
    ...DEFAULT_PANEL_OPTIONS,
    nodes: [],
    edges: [],
    groups: [],
    ...overrides,
  };
}

// ─── setNodeType ──────────────────────────────────────────────────────

describe('setNodeType', () => {
  test('updates the type of the matching node and leaves others untouched', () => {
    const base = opts({
      nodes: [
        node({ id: 'n-a', type: 'server' }),
        node({ id: 'n-b', type: 'database' }),
      ],
    });
    const next = setNodeType(base, 'n-a', 'firewall');
    expect(next.nodes.find((n) => n.id === 'n-a')?.type).toBe('firewall');
    expect(next.nodes.find((n) => n.id === 'n-b')?.type).toBe('database');
  });

  test('returns options unchanged when nodeId does not exist', () => {
    const base = opts({ nodes: [node({ id: 'n-a' })] });
    const next = setNodeType(base, 'n-ghost', 'firewall');
    expect(next).toBe(base);
  });

  test('does not mutate the input options object', () => {
    const base = opts({ nodes: [node({ id: 'n-a', type: 'server' })] });
    setNodeType(base, 'n-a', 'firewall');
    expect(base.nodes[0].type).toBe('server');
  });
});

// ─── toggleNodeCompact ────────────────────────────────────────────────

describe('toggleNodeCompact', () => {
  test('flips compact: false → true', () => {
    const base = opts({ nodes: [node({ id: 'n-a', compact: false })] });
    const next = toggleNodeCompact(base, 'n-a');
    expect(next.nodes[0].compact).toBe(true);
  });

  test('flips compact: true → false', () => {
    const base = opts({ nodes: [node({ id: 'n-a', compact: true })] });
    const next = toggleNodeCompact(base, 'n-a');
    expect(next.nodes[0].compact).toBe(false);
  });

  test('returns options unchanged when nodeId does not exist', () => {
    const base = opts({ nodes: [node({ id: 'n-a' })] });
    const next = toggleNodeCompact(base, 'n-ghost');
    expect(next).toBe(base);
  });
});

// ─── addNodeToGroup ───────────────────────────────────────────────────

describe('addNodeToGroup', () => {
  test('adds a node to a group', () => {
    const base = opts({
      nodes: [node({ id: 'n-a' })],
      groups: [group({ id: 'g-1', nodeIds: [] })],
    });
    const next = addNodeToGroup(base, 'n-a', 'g-1');
    expect(next.groups.find((g) => g.id === 'g-1')?.nodeIds).toEqual(['n-a']);
  });

  test('is idempotent when the node is already in the target group', () => {
    const base = opts({
      groups: [group({ id: 'g-1', nodeIds: ['n-a'] })],
    });
    const next = addNodeToGroup(base, 'n-a', 'g-1');
    expect(next).toBe(base);
  });

  test('removes the node from any other group before adding it to the new one', () => {
    const base = opts({
      groups: [
        group({ id: 'g-1', nodeIds: ['n-a', 'n-b'] }),
        group({ id: 'g-2', nodeIds: [] }),
      ],
    });
    const next = addNodeToGroup(base, 'n-a', 'g-2');
    expect(next.groups.find((g) => g.id === 'g-1')?.nodeIds).toEqual(['n-b']);
    expect(next.groups.find((g) => g.id === 'g-2')?.nodeIds).toEqual(['n-a']);
  });

  test('returns options unchanged when the target group does not exist', () => {
    const base = opts({ groups: [group({ id: 'g-1' })] });
    const next = addNodeToGroup(base, 'n-a', 'g-ghost');
    expect(next).toBe(base);
  });
});

// ─── removeNodeFromGroup ──────────────────────────────────────────────

describe('removeNodeFromGroup', () => {
  test('removes the node from whatever group contains it', () => {
    const base = opts({
      groups: [group({ id: 'g-1', nodeIds: ['n-a', 'n-b'] })],
    });
    const next = removeNodeFromGroup(base, 'n-a');
    expect(next.groups[0].nodeIds).toEqual(['n-b']);
  });

  test('is a no-op when the node is not in any group', () => {
    const base = opts({
      groups: [group({ id: 'g-1', nodeIds: ['n-b'] })],
    });
    const next = removeNodeFromGroup(base, 'n-a');
    expect(next).toBe(base);
  });
});

// ─── createEdgeBetween ────────────────────────────────────────────────

describe('createEdgeBetween', () => {
  test('creates a new edge with DEFAULT_EDGE defaults between two existing nodes', () => {
    const base = opts({
      nodes: [node({ id: 'n-a' }), node({ id: 'n-b' })],
    });
    const { options: next, newEdgeId } = createEdgeBetween(base, 'n-a', 'n-b', 'e-fixed');
    expect(newEdgeId).toBe('e-fixed');
    expect(next.edges).toHaveLength(1);
    const edge = next.edges[0];
    expect(edge.id).toBe('e-fixed');
    expect(edge.sourceId).toBe('n-a');
    expect(edge.targetId).toBe('n-b');
    expect(edge.type).toBe('traffic');
    expect(edge.bidirectional).toBe(false);
  });

  test('rejects self-connection', () => {
    const base = opts({ nodes: [node({ id: 'n-a' })] });
    const { options: next, newEdgeId } = createEdgeBetween(base, 'n-a', 'n-a', 'e-fixed');
    expect(newEdgeId).toBeNull();
    expect(next).toBe(base);
  });

  test('rejects when source node does not exist', () => {
    const base = opts({ nodes: [node({ id: 'n-b' })] });
    const { options: next, newEdgeId } = createEdgeBetween(base, 'n-ghost', 'n-b', 'e-fixed');
    expect(newEdgeId).toBeNull();
    expect(next).toBe(base);
  });

  test('rejects when either endpoint is a virtual node', () => {
    const base = opts({
      nodes: [node({ id: 'n-a' }), node({ id: 'n-b', _virtual: true })],
    });
    const { newEdgeId } = createEdgeBetween(base, 'n-a', 'n-b', 'e-fixed');
    expect(newEdgeId).toBeNull();
  });
});
