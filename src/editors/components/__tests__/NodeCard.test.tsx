// ─── Mocks (identical layering to EdgeCard.test.tsx + MetricEditor.test.tsx) ─
//
// NodeCard is heavy (640 LOC) and pulls @grafana/ui, @grafana/runtime, and
// the MetricEditor sub-component. Stub the UI primitives with lightweight
// React.createElement shims so tests exercise NodeCard's own state machine
// (alert-matcher mirror resync, observability-link CRUD, sectionHint
// routing, icon/color overrides) without the real Grafana component tree.

jest.mock('@grafana/ui', () => {
  const React = require('react');
  return {
    Button: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('button', { ...props, type: 'button' }, props.children),
    IconButton: (props: Record<string, unknown>) =>
      React.createElement('button', {
        ...props,
        type: 'button',
        'aria-label': props.tooltip ?? props.name,
      }),
    Input: (props: {
      value?: unknown;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      placeholder?: string;
      width?: number;
      type?: string;
      prefix?: React.ReactNode;
    }) =>
      React.createElement('input', {
        type: props.type ?? 'text',
        value: (props.value as string) ?? '',
        onChange: props.onChange,
        placeholder: props.placeholder,
      }),
    TextArea: (props: {
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
      placeholder?: string;
      rows?: number;
    }) =>
      React.createElement('textarea', {
        value: props.value ?? '',
        onChange: props.onChange,
        placeholder: props.placeholder,
      }),
    Checkbox: (props: {
      value?: boolean;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      label?: string;
    }) =>
      React.createElement(
        'label',
        {},
        React.createElement('input', {
          type: 'checkbox',
          checked: !!props.value,
          onChange: props.onChange,
          'data-testid': props.label
            ? `checkbox-${(props.label as string).toLowerCase().replace(/[^a-z0-9]/g, '-')}`
            : undefined,
        }),
        props.label
      ),
    // Stub exposes isOpen + label so tests can assert which section is open.
    CollapsableSection: (props: {
      label?: React.ReactNode;
      isOpen?: boolean;
      onToggle?: () => void;
      children?: React.ReactNode;
    }) => {
      const labelStr = typeof props.label === 'string' ? props.label : undefined;
      return React.createElement(
        'section',
        {
          'data-testid': 'collapsable',
          'data-is-open': String(!!props.isOpen),
          ...(labelStr ? { 'data-label': labelStr } : {}),
        },
        React.createElement('button', { onClick: props.onToggle, type: 'button' }, props.label),
        props.isOpen ? React.createElement('div', {}, props.children) : null
      );
    },
    Select: (props: {
      options?: Array<{ label: string; value: string }>;
      value?: unknown;
      onChange?: (v: { value?: string }) => void;
      placeholder?: string;
      isClearable?: boolean;
      allowCustomValue?: boolean;
      isDisabled?: boolean;
      isLoading?: boolean;
    }) =>
      React.createElement(
        'select',
        {
          value:
            (typeof props.value === 'string'
              ? props.value
              : (props.value as { value?: string })?.value) ?? '',
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
            props.onChange?.({ value: e.target.value }),
          disabled: props.isDisabled,
        },
        React.createElement('option', { key: '__placeholder', value: '' }, props.placeholder ?? ''),
        (props.options ?? []).map((o) =>
          React.createElement('option', { key: o.value, value: o.value }, o.label ?? o.value)
        )
      ),
  };
});

jest.mock('@grafana/runtime', () => {
  const React = require('react');
  return {
    getDataSourceSrv: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ type: 'unknown' }),
    }),
    DataSourcePicker: () => React.createElement('div', { 'data-testid': 'ds-picker' }),
  };
});

// MetricEditor is tested independently (MetricEditor.test.tsx). Stub it to a
// labelled placeholder so NodeCard's metric list CRUD can be asserted without
// the MetricEditor's internal state leaking into these tests.
jest.mock('../MetricEditor', () => ({
  MetricEditor: ({ metric, onDelete }: { metric: { id: string; label: string }; onDelete: () => void }) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': `metric-editor-${metric.id}` },
      React.createElement('span', {}, metric.label),
      React.createElement(
        'button',
        { type: 'button', onClick: onDelete, 'data-testid': `delete-metric-${metric.id}` },
        'delete'
      )
    );
  },
}));

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NodeCard } from '../NodeCard';
import { TopologyNode, NodeGroup, NODE_TYPE_CONFIG } from '../../../types';
import { NodeEditSection } from '../../../utils/panelEvents';

function makeNode(overrides: Partial<TopologyNode> = {}): TopologyNode {
  return {
    id: 'n-test',
    name: 'server-01',
    role: 'app server',
    type: 'server',
    metrics: [],
    position: { x: 100, y: 100 },
    compact: false,
    ...overrides,
  };
}

beforeEach(() => {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [] }),
  });
});

type OnChange = (updated: TopologyNode) => void;

function renderNodeCard(
  node: TopologyNode,
  opts: {
    onChange?: jest.Mock;
    groups?: NodeGroup[];
    sectionHint?: NodeEditSection;
    isOpen?: boolean;
  } = {}
) {
  const onChange = opts.onChange ?? (jest.fn() as jest.Mock);
  const result = render(
    <NodeCard
      node={node}
      groups={opts.groups ?? []}
      isOpen={opts.isOpen ?? true}
      onToggle={jest.fn()}
      onChange={onChange as unknown as OnChange}
      onDelete={jest.fn()}
      onDuplicate={jest.fn()}
      sectionHint={opts.sectionHint}
    />
  );
  return { ...result, onChange };
}

// Pull the last TopologyNode passed to onChange for assertion-friendly access.
function lastOnChange(onChange: jest.Mock): TopologyNode {
  expect(onChange).toHaveBeenCalled();
  return onChange.mock.calls.at(-1)![0] as TopologyNode;
}

// ─── Header / identity ─────────────────────────────────────────────────

describe('NodeCard — header and identity', () => {
  test('renders node name in the CollapsableSection header', () => {
    renderNodeCard(makeNode({ name: 'web-02' }));
    expect(screen.getAllByText('web-02').length).toBeGreaterThan(0);
  });

  test('shows type icon badge from NODE_TYPE_CONFIG', () => {
    renderNodeCard(makeNode({ type: 'database' }));
    const badge = NODE_TYPE_CONFIG.database.icon;
    expect(screen.getAllByText(badge).length).toBeGreaterThan(0);
  });

  test('changing the Type select writes node.type via onChange', () => {
    const { onChange } = renderNodeCard(makeNode({ type: 'server' }));
    // The Identity section shows the type Select once name/metrics/instance
    // gate is satisfied — the fixture has name 'server-01' (not 'New node')
    // so the Identity block renders.
    // getByDisplayValue on a <select> matches the displayed option text
    // (not the value attribute). getNodeTypeOptions labels each option as
    // `${icon} — ${value}`, so 'server' displays as 'SRV — server'.
    const typeSelect = screen.getByDisplayValue('SRV — server') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'firewall' } });
    expect(lastOnChange(onChange).type).toBe('firewall');
  });
});

// ─── Alert matchers ────────────────────────────────────────────────────
//
// Matcher list is managed via a local-state mirror to keep input focus
// stable during rapid typing. `syncMatchers` converts the array to a plain
// object, dropping entries with empty keys, and writes undefined to
// alertLabelMatchers when the object is empty.

describe('NodeCard — alert matchers', () => {
  test('adding a matcher + setting key/value writes alertLabelMatchers object', async () => {
    const { onChange } = renderNodeCard(makeNode(), { sectionHint: 'alertMatchers' });
    const addBtn = await screen.findByText('Add matcher');
    fireEvent.click(addBtn);
    // A new empty matcher row appears with a key Input and a value Input.
    const keyInputs = screen.getAllByPlaceholderText(/label \(e\.g\./);
    const valueInputs = screen.getAllByPlaceholderText('value');
    act(() => {
      fireEvent.change(keyInputs[0], { target: { value: 'instance' } });
    });
    act(() => {
      fireEvent.change(valueInputs[0], { target: { value: 'web-01:9100' } });
    });
    expect(lastOnChange(onChange).alertLabelMatchers).toEqual({ instance: 'web-01:9100' });
  });

  test('removing the last matcher clears alertLabelMatchers to undefined', async () => {
    const { onChange } = renderNodeCard(
      makeNode({ alertLabelMatchers: { instance: 'web-01' } }),
      { sectionHint: 'alertMatchers' }
    );
    const removeBtn = await screen.findByLabelText('Remove matcher');
    fireEvent.click(removeBtn);
    expect(lastOnChange(onChange).alertLabelMatchers).toBeUndefined();
  });

  // Regression for NodeCard.tsx:199-207 — silent data-loss when a parent
  // re-renders this component instance with a different node (e.g. filter
  // search reusing the React instance): local matcher state must resync
  // or the UI shows stale rows while handleField writes to the new node.
  test('local matcher mirror resyncs when node.id changes', () => {
    const { rerender } = render(
      <NodeCard
        node={makeNode({ id: 'n-a', alertLabelMatchers: { env: 'prod' } })}
        groups={[]}
        isOpen={true}
        onToggle={jest.fn()}
        onChange={jest.fn()}
        onDelete={jest.fn()}
        sectionHint="alertMatchers"
      />
    );
    expect(screen.getByDisplayValue('env')).toBeInTheDocument();
    expect(screen.getByDisplayValue('prod')).toBeInTheDocument();
    // Different node → mirror must discard env=prod and show the new matchers.
    rerender(
      <NodeCard
        node={makeNode({ id: 'n-b', alertLabelMatchers: { region: 'eu-west-2' } })}
        groups={[]}
        isOpen={true}
        onToggle={jest.fn()}
        onChange={jest.fn()}
        onDelete={jest.fn()}
        sectionHint="alertMatchers"
      />
    );
    expect(screen.queryByDisplayValue('env')).toBeNull();
    expect(screen.queryByDisplayValue('prod')).toBeNull();
    expect(screen.getByDisplayValue('region')).toBeInTheDocument();
    expect(screen.getByDisplayValue('eu-west-2')).toBeInTheDocument();
  });
});

// ─── Observability links ──────────────────────────────────────────────

describe('NodeCard — observability links', () => {
  test('setting label + url persists the link via onChange', async () => {
    const { onChange } = renderNodeCard(makeNode(), { sectionHint: 'observabilityLinks' });
    const addBtn = await screen.findByText('Add link');
    fireEvent.click(addBtn);
    // Row renders with label Input + icon Input + url Input.
    const labelInput = screen.getByPlaceholderText('Logs');
    const urlInput = screen.getByPlaceholderText(/https:\/\/\.\.\./);
    act(() => {
      fireEvent.change(labelInput, { target: { value: 'Runbook' } });
    });
    act(() => {
      fireEvent.change(urlInput, { target: { value: 'https://wiki/runbook' } });
    });
    expect(lastOnChange(onChange).observabilityLinks).toEqual([
      { label: 'Runbook', url: 'https://wiki/runbook' },
    ]);
  });

  test('link with only label (no url) is filtered out of persisted array', async () => {
    const { onChange } = renderNodeCard(makeNode(), { sectionHint: 'observabilityLinks' });
    fireEvent.click(await screen.findByText('Add link'));
    const labelInput = screen.getByPlaceholderText('Logs');
    act(() => {
      fireEvent.change(labelInput, { target: { value: 'LabelOnly' } });
    });
    // syncLinks filters rows where label or url is empty — nothing persists.
    expect(lastOnChange(onChange).observabilityLinks).toBeUndefined();
  });

  test('removing the last link clears observabilityLinks to undefined', async () => {
    const { onChange } = renderNodeCard(
      makeNode({ observabilityLinks: [{ label: 'Logs', url: 'https://logs' }] }),
      { sectionHint: 'observabilityLinks' }
    );
    fireEvent.click(await screen.findByLabelText('Remove link'));
    expect(lastOnChange(onChange).observabilityLinks).toBeUndefined();
  });
});

// ─── iconOverride / colorOverride ─────────────────────────────────────

describe('NodeCard — icon/color overrides', () => {
  test('iconOverride writes to node.iconOverride', () => {
    const { onChange } = renderNodeCard(makeNode(), { sectionHint: 'advanced' });
    const input = screen.getByPlaceholderText('SB, GA, API...');
    act(() => {
      fireEvent.change(input, { target: { value: 'SB' } });
    });
    expect(lastOnChange(onChange).iconOverride).toBe('SB');
  });

  test('colorOverride text input writes hex value', () => {
    const { onChange } = renderNodeCard(makeNode(), { sectionHint: 'advanced' });
    const input = screen.getByPlaceholderText('#a3be8c');
    act(() => {
      fireEvent.change(input, { target: { value: '#88c0d0' } });
    });
    expect(lastOnChange(onChange).colorOverride).toBe('#88c0d0');
  });

  test('colorOverride clear button resets the field to undefined', () => {
    const { onChange } = renderNodeCard(
      makeNode({ colorOverride: '#bf616a' }),
      { sectionHint: 'advanced' }
    );
    fireEvent.click(screen.getByLabelText('Clear color override'));
    expect(lastOnChange(onChange).colorOverride).toBeUndefined();
  });
});

// ─── Metric list CRUD ─────────────────────────────────────────────────

describe('NodeCard — metric list CRUD', () => {
  test('Add metric manually creates a new metric entry', async () => {
    const { onChange } = renderNodeCard(
      makeNode({
        metrics: [{
          id: 'm1', label: 'cpu', datasourceUid: '', query: '',
          format: '${value}', section: 'General', isSummary: true,
          thresholds: [], showSparkline: false,
        }],
      }),
      { sectionHint: 'metrics' }
    );
    const addBtn = await screen.findByText('Add metric manually');
    fireEvent.click(addBtn);
    const updated = lastOnChange(onChange);
    expect(updated.metrics).toHaveLength(2);
    expect(updated.metrics[1].label).toBe('metric');
  });

  test('Deleting a metric removes it from node.metrics', () => {
    const { onChange } = renderNodeCard(
      makeNode({
        metrics: [
          { id: 'm1', label: 'cpu', datasourceUid: '', query: '', format: '${value}', section: 'General', isSummary: true, thresholds: [], showSparkline: false },
          { id: 'm2', label: 'mem', datasourceUid: '', query: '', format: '${value}', section: 'General', isSummary: false, thresholds: [], showSparkline: false },
        ],
      }),
      { sectionHint: 'metrics' }
    );
    fireEvent.click(screen.getByTestId('delete-metric-m1'));
    const updated = lastOnChange(onChange);
    expect(updated.metrics.map((m) => m.id)).toEqual(['m2']);
  });
});

// ─── sectionHint routing ──────────────────────────────────────────────

describe('NodeCard — sectionHint routing', () => {
  test('sectionHint="metrics" opens the Configured metrics section', () => {
    renderNodeCard(
      makeNode({
        metrics: [{
          id: 'm1', label: 'cpu', datasourceUid: '', query: '',
          format: '${value}', section: 'General', isSummary: true,
          thresholds: [], showSparkline: false,
        }],
      }),
      { sectionHint: 'metrics' }
    );
    const section = screen
      .getAllByTestId('collapsable')
      .find((el) => el.getAttribute('data-label')?.startsWith('Configured metrics'));
    expect(section).toBeDefined();
    expect(section!.getAttribute('data-is-open')).toBe('true');
  });

  test('sectionHint="alertMatchers" opens the Advanced section (where matchers live)', () => {
    renderNodeCard(makeNode(), { sectionHint: 'alertMatchers' });
    const advanced = screen
      .getAllByTestId('collapsable')
      .find((el) => el.getAttribute('data-label') === 'Advanced');
    expect(advanced).toBeDefined();
    expect(advanced!.getAttribute('data-is-open')).toBe('true');
  });

  test('sectionHint="observabilityLinks" also opens the Advanced section', () => {
    renderNodeCard(makeNode(), { sectionHint: 'observabilityLinks' });
    const advanced = screen
      .getAllByTestId('collapsable')
      .find((el) => el.getAttribute('data-label') === 'Advanced');
    expect(advanced!.getAttribute('data-is-open')).toBe('true');
  });
});
