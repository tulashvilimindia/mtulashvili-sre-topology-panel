import { setNodeType, toggleNodeCompact } from '../nodeMutations';
import { TopologyPanelOptions, TopologyNode, DEFAULT_PANEL_OPTIONS } from '../../types';

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
