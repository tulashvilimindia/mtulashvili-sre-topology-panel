// End-to-end tests for the hybrid click-ops context menu.
//
// Unlike TopologyPanel.test.tsx (which stubs TopologyCanvas to test the
// panel shell in isolation), this file renders the REAL TopologyPanel +
// REAL TopologyCanvas + REAL ContextMenu together so we can fire a
// right-click on a node, open the menu, click a submenu item, and
// assert that onOptionsChange received the fully-mutated options.
//
// jsdom mocks (matchMedia, ResizeObserver) are installed as a side
// effect of importing the harness.

import './TopologyCanvas.harness';

// Stub Grafana UI primitives rendered by the popups (icon, etc.). The
// ContextMenu itself uses no @grafana/ui imports. NodePopup / EdgePopup
// use Icon but neither is visible until the user clicks, so they're
// harmless here — stub defensively so we don't blow up on accidental
// render.
jest.mock('@grafana/ui', () => {
  const ReactImpl = require('react');
  return {
    Icon: ({ name }: { name: string }) => ReactImpl.createElement('span', {}, name),
    IconName: {},
  };
});

jest.mock('@grafana/runtime', () => ({
  getDataSourceSrv: jest.fn().mockReturnValue({
    get: jest.fn(),
    getInstanceSettings: jest.fn().mockReturnValue({ type: 'prometheus' }),
  }),
  DataSourcePicker: () => null,
}));

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TopologyPanel } from '../TopologyPanel';
import { DEFAULT_PANEL_OPTIONS, TopologyPanelOptions, TopologyNode, TopologyEdge, DEFAULT_EDGE } from '../../types';

function buildNode(overrides: Partial<TopologyNode> = {}): TopologyNode {
  return {
    id: 'n-a',
    name: 'A',
    role: '',
    type: 'server',
    metrics: [],
    position: { x: 50, y: 50 },
    compact: false,
    ...overrides,
  };
}

function buildEdge(overrides: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    ...(DEFAULT_EDGE as TopologyEdge),
    id: 'e-ab',
    sourceId: 'n-a',
    targetId: 'n-b',
    ...overrides,
  };
}

function makePanelProps(optionsOverrides: Partial<TopologyPanelOptions> = {}) {
  const onOptionsChange = jest.fn();
  const options: TopologyPanelOptions = {
    ...DEFAULT_PANEL_OPTIONS,
    nodes: [
      buildNode({ id: 'n-a', name: 'A', position: { x: 50, y: 50 } }),
      buildNode({ id: 'n-b', name: 'B', position: { x: 300, y: 50 } }),
    ],
    edges: [buildEdge({ id: 'e-ab', sourceId: 'n-a', targetId: 'n-b' })],
    groups: [],
    ...optionsOverrides,
  };
  return {
    props: {
      options,
      onOptionsChange,
      data: { series: [], state: 'Done', timeRange: {} },
      width: 800,
      height: 600,
      replaceVariables: (s: string) => s,
      id: 1,
      timeRange: {},
      timeZone: 'utc',
      title: 'Test Panel',
      transparent: false,
      fieldConfig: { defaults: {}, overrides: [] },
      renderCounter: 0,
      eventBus: {},
    },
    onOptionsChange,
  };
}

const asPanelProps = (p: Record<string, unknown>) =>
  p as unknown as React.ComponentProps<typeof TopologyPanel>;

// Force edit-mode detection: TopologyPanel reads window.location.search
// for "editPanel". jsdom allows modifying the URL via history API —
// Object.defineProperty on window.location would throw.
function renderInEditMode(optionsOverrides: Partial<TopologyPanelOptions> = {}) {
  const originalPath = window.location.pathname;
  window.history.replaceState(null, '', `${originalPath}?editPanel=1`);
  const { props, onOptionsChange } = makePanelProps(optionsOverrides);
  const result = render(<TopologyPanel {...asPanelProps(props as Record<string, unknown>)} />);
  return {
    ...result,
    onOptionsChange,
    restore: () => {
      window.history.replaceState(null, '', originalPath);
    },
  };
}

describe('TopologyPanel click-ops end-to-end', () => {
  test('right-click node → Change type → firewall updates node.type via onOptionsChange', async () => {
    const { onOptionsChange, restore } = renderInEditMode();
    try {
      // Node A is rendered with aria-label "A (server): ..."
      const nodeA = screen.getByLabelText(/A \(server\)/);
      fireEvent.contextMenu(nodeA, { clientX: 60, clientY: 60 });
      const menu = await screen.findByTestId('topology-context-menu');
      fireEvent.click(within(menu).getByText('Change type'));
      const submenu = await screen.findByTestId('topology-context-submenu');
      fireEvent.click(within(submenu).getByText(/firewall/));
      expect(onOptionsChange).toHaveBeenCalled();
      const lastCall = onOptionsChange.mock.calls.at(-1);
      const newOpts = lastCall[0] as TopologyPanelOptions;
      const updatedNode = newOpts.nodes.find((n) => n.id === 'n-a');
      expect(updatedNode?.type).toBe('firewall');
    } finally {
      restore();
    }
  });

  test('right-click node → Compact mode flips node.compact', async () => {
    const { onOptionsChange, restore } = renderInEditMode();
    try {
      const nodeA = screen.getByLabelText(/A \(server\)/);
      fireEvent.contextMenu(nodeA, { clientX: 60, clientY: 60 });
      const menu = await screen.findByTestId('topology-context-menu');
      fireEvent.click(within(menu).getByText('Compact mode'));
      expect(onOptionsChange).toHaveBeenCalled();
      const newOpts = onOptionsChange.mock.calls.at(-1)[0] as TopologyPanelOptions;
      expect(newOpts.nodes.find((n) => n.id === 'n-a')?.compact).toBe(true);
    } finally {
      restore();
    }
  });

  test('right-click edge → Change type → HA sync updates edge.type', async () => {
    const { onOptionsChange, restore } = renderInEditMode();
    try {
      const edgeEl = screen.getByTestId('edge-hit-e-ab');
      fireEvent.contextMenu(edgeEl, { clientX: 200, clientY: 50 });
      const menu = await screen.findByTestId('topology-context-menu');
      fireEvent.click(within(menu).getByText('Change type'));
      const submenu = await screen.findByTestId('topology-context-submenu');
      fireEvent.click(within(submenu).getByText('HA sync'));
      expect(onOptionsChange).toHaveBeenCalled();
      const newOpts = onOptionsChange.mock.calls.at(-1)[0] as TopologyPanelOptions;
      expect(newOpts.edges.find((e) => e.id === 'e-ab')?.type).toBe('ha_sync');
    } finally {
      restore();
    }
  });

  test('right-click edge → Bidirectional toggles edge.bidirectional', async () => {
    const { onOptionsChange, restore } = renderInEditMode();
    try {
      const edgeEl = screen.getByTestId('edge-hit-e-ab');
      fireEvent.contextMenu(edgeEl, { clientX: 200, clientY: 50 });
      const menu = await screen.findByTestId('topology-context-menu');
      fireEvent.click(within(menu).getByText('Bidirectional'));
      expect(onOptionsChange).toHaveBeenCalled();
      const newOpts = onOptionsChange.mock.calls.at(-1)[0] as TopologyPanelOptions;
      expect(newOpts.edges.find((e) => e.id === 'e-ab')?.bidirectional).toBe(true);
    } finally {
      restore();
    }
  });

  test('right-click node → Edit alert matchers does NOT call onOptionsChange (sidebar redirect only)', async () => {
    const { onOptionsChange, restore } = renderInEditMode();
    try {
      const nodeA = screen.getByLabelText(/A \(server\)/);
      fireEvent.contextMenu(nodeA, { clientX: 60, clientY: 60 });
      const menu = await screen.findByTestId('topology-context-menu');
      fireEvent.click(within(menu).getByText('Edit alert matchers'));
      // Sidebar redirect is a pub/sub event — it does NOT mutate options.
      // The assertion is that onOptionsChange was NOT called as a result of
      // clicking this item. (Nothing else in the test could call it.)
      expect(onOptionsChange).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test('right-click node → Edit observability links is a sidebar redirect (no onOptionsChange)', async () => {
    const { onOptionsChange, restore } = renderInEditMode();
    try {
      const nodeA = screen.getByLabelText(/A \(server\)/);
      fireEvent.contextMenu(nodeA, { clientX: 60, clientY: 60 });
      const menu = await screen.findByTestId('topology-context-menu');
      fireEvent.click(within(menu).getByText('Edit observability links'));
      // Same redirect-only semantic as Edit alert matchers — no slice mutation.
      expect(onOptionsChange).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test('right-click edge → Edit metric binding is a sidebar redirect (no onOptionsChange)', async () => {
    const { onOptionsChange, restore } = renderInEditMode();
    try {
      const edgeEl = screen.getByTestId('edge-hit-e-ab');
      fireEvent.contextMenu(edgeEl, { clientX: 200, clientY: 50 });
      const menu = await screen.findByTestId('topology-context-menu');
      fireEvent.click(within(menu).getByText('Edit metric binding'));
      // Routes to EdgesEditor → EdgeCard via emitEdgeEditRequest('edge-id', 'metric').
      // Pub/sub only — no options mutation.
      expect(onOptionsChange).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test('keyboard: ArrowRight on focused submenu item opens the submenu and ArrowLeft closes it', async () => {
    const { restore } = renderInEditMode();
    try {
      const nodeA = screen.getByLabelText(/A \(server\)/);
      fireEvent.contextMenu(nodeA, { clientX: 60, clientY: 60 });
      const menu = await screen.findByTestId('topology-context-menu');
      // Walk down to the "Change type" submenu trigger via keyboard (skip
      // "Edit in sidebar" — first menuitem on initial focus).
      const items = within(menu).getAllByRole('menuitem');
      const changeTypeIdx = items.findIndex((el) => el.textContent?.includes('Change type'));
      expect(changeTypeIdx).toBeGreaterThanOrEqual(0);
      // Focus that item directly (testing the navigation primitive on a known item),
      // then ArrowRight should open the submenu.
      items[changeTypeIdx].focus();
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      const submenu = await screen.findByTestId('topology-context-submenu');
      expect(submenu).toBeInTheDocument();
      // ArrowLeft on the submenu should close it (and not also close the root).
      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      // Submenu unmounts; root menu stays.
      expect(screen.queryByTestId('topology-context-submenu')).toBeNull();
      expect(screen.getByTestId('topology-context-menu')).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
