import {
  setEdgeType,
  toggleEdgeBidirectional,
  toggleEdgeFlowAnimation,
  setEdgeFlowSpeed,
  setEdgeAnchor,
} from '../edgeMutations';
import { TopologyPanelOptions, TopologyEdge, DEFAULT_PANEL_OPTIONS } from '../../types';

function edge(overrides: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    id: 'e-test',
    sourceId: 'n-a',
    targetId: 'n-b',
    type: 'traffic',
    thicknessMode: 'fixed',
    thicknessMin: 1.5,
    thicknessMax: 4,
    thresholds: [],
    flowAnimation: true,
    bidirectional: false,
    anchorSource: 'auto',
    anchorTarget: 'auto',
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

// ─── setEdgeType ──────────────────────────────────────────────────────

describe('setEdgeType', () => {
  test('updates only the matching edge', () => {
    const base = opts({
      edges: [edge({ id: 'e-1', type: 'traffic' }), edge({ id: 'e-2', type: 'traffic' })],
    });
    const next = setEdgeType(base, 'e-1', 'ha_sync');
    expect(next.edges.find((e) => e.id === 'e-1')?.type).toBe('ha_sync');
    expect(next.edges.find((e) => e.id === 'e-2')?.type).toBe('traffic');
  });

  test('returns options unchanged when edgeId does not exist', () => {
    const base = opts({ edges: [edge({ id: 'e-1' })] });
    const next = setEdgeType(base, 'e-ghost', 'ha_sync');
    expect(next).toBe(base);
  });
});

// ─── toggleEdgeBidirectional ──────────────────────────────────────────

describe('toggleEdgeBidirectional', () => {
  test('flips bidirectional false → true → false', () => {
    const base = opts({ edges: [edge({ id: 'e-1', bidirectional: false })] });
    const after1 = toggleEdgeBidirectional(base, 'e-1');
    expect(after1.edges[0].bidirectional).toBe(true);
    const after2 = toggleEdgeBidirectional(after1, 'e-1');
    expect(after2.edges[0].bidirectional).toBe(false);
  });
});

// ─── toggleEdgeFlowAnimation ──────────────────────────────────────────

describe('toggleEdgeFlowAnimation', () => {
  test('flips flowAnimation true → false', () => {
    const base = opts({ edges: [edge({ id: 'e-1', flowAnimation: true })] });
    const next = toggleEdgeFlowAnimation(base, 'e-1');
    expect(next.edges[0].flowAnimation).toBe(false);
  });
});

// ─── setEdgeFlowSpeed ─────────────────────────────────────────────────

describe('setEdgeFlowSpeed', () => {
  test('sets flow speed', () => {
    const base = opts({ edges: [edge({ id: 'e-1', flowSpeed: undefined })] });
    const next = setEdgeFlowSpeed(base, 'e-1', 'fast');
    expect(next.edges[0].flowSpeed).toBe('fast');
  });

  test('clears flow speed to undefined (inherit from panel defaults)', () => {
    const base = opts({ edges: [edge({ id: 'e-1', flowSpeed: 'fast' })] });
    const next = setEdgeFlowSpeed(base, 'e-1', undefined);
    expect(next.edges[0].flowSpeed).toBeUndefined();
  });
});

// ─── setEdgeAnchor ────────────────────────────────────────────────────

describe('setEdgeAnchor', () => {
  test('sets source anchor only', () => {
    const base = opts({
      edges: [edge({ id: 'e-1', anchorSource: 'auto', anchorTarget: 'auto' })],
    });
    const next = setEdgeAnchor(base, 'e-1', 'source', 'top');
    expect(next.edges[0].anchorSource).toBe('top');
    expect(next.edges[0].anchorTarget).toBe('auto');
  });

  test('sets target anchor only', () => {
    const base = opts({
      edges: [edge({ id: 'e-1', anchorSource: 'auto', anchorTarget: 'auto' })],
    });
    const next = setEdgeAnchor(base, 'e-1', 'target', 'bottom');
    expect(next.edges[0].anchorSource).toBe('auto');
    expect(next.edges[0].anchorTarget).toBe('bottom');
  });
});
