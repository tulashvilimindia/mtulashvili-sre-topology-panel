// ─── Mock @grafana/ui primitives (same approach as MetricEditor.test.tsx) ───
jest.mock('@grafana/ui', () => {
  const React = require('react');
  return {
    Button: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('button', { ...props, type: 'button' }, props.children),
    IconButton: (props: Record<string, unknown>) =>
      React.createElement('button', { ...props, 'aria-label': props.tooltip ?? props.name }),
    Input: (props: { value?: unknown; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; width?: number; type?: string; prefix?: React.ReactNode }) =>
      React.createElement('input', {
        type: props.type ?? 'text',
        value: (props.value as string) ?? '',
        onChange: props.onChange,
        placeholder: props.placeholder,
      }),
    TextArea: (props: { value?: string; onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string; rows?: number }) =>
      React.createElement('textarea', {
        value: props.value ?? '',
        onChange: props.onChange,
        placeholder: props.placeholder,
      }),
    Checkbox: (props: { value?: boolean; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; label?: string }) =>
      React.createElement('label', {},
        React.createElement('input', {
          type: 'checkbox',
          checked: !!props.value,
          onChange: props.onChange,
          'data-testid': props.label ? `checkbox-${(props.label as string).toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined,
        }),
        props.label
      ),
    // CollapsableSection exposes isOpen + label via data attributes so tests
    // can assert which section is open without traversing the Grafana DOM.
    CollapsableSection: (props: { label?: React.ReactNode; isOpen?: boolean; onToggle?: () => void; children?: React.ReactNode }) => {
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
      width?: number;
    }) =>
      React.createElement('select', {
        value: (typeof props.value === 'string' ? props.value : (props.value as { value?: string })?.value) ?? '',
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => props.onChange?.({ value: e.target.value }),
        disabled: props.isDisabled,
      },
        React.createElement('option', { key: '__placeholder', value: '' }, props.placeholder ?? ''),
        (props.options ?? []).map((o) =>
          React.createElement('option', { key: o.value, value: o.value }, o.label ?? o.value)
        )
      ),
    RadioButtonGroup: (props: { options?: Array<{ label: string; value: string }>; value?: string; onChange?: (v: string) => void; size?: string }) =>
      React.createElement(
        'div',
        { role: 'radiogroup' },
        (props.options ?? []).map((o) =>
          React.createElement(
            'label',
            { key: o.value },
            React.createElement('input', {
              type: 'radio',
              checked: props.value === o.value,
              onChange: () => props.onChange?.(o.value),
              'data-testid': `radio-${o.value}`,
            }),
            o.label
          )
        )
      ),
  };
});

// ─── Mock @grafana/runtime ────────────────────────────────────────────
const getDataSourceSrvMock = jest.fn();
jest.mock('@grafana/runtime', () => {
  const React = require('react');
  return {
    getDataSourceSrv: () => getDataSourceSrvMock(),
    DataSourcePicker: () => React.createElement('div', { 'data-testid': 'ds-picker' }),
  };
});

// ─── Mock cloudwatchResources ─────────────────────────────────────────
const fetchCwNamespacesMock = jest.fn();
const fetchCwMetricsMock = jest.fn();
const fetchCwDimensionKeysMock = jest.fn();
const getCloudWatchDefaultRegionMock = jest.fn();
jest.mock('../../../utils/cloudwatchResources', () => ({
  fetchCwNamespaces: (...args: unknown[]) => fetchCwNamespacesMock(...args),
  fetchCwMetrics: (...args: unknown[]) => fetchCwMetricsMock(...args),
  fetchCwDimensionKeys: (...args: unknown[]) => fetchCwDimensionKeysMock(...args),
  getCloudWatchDefaultRegion: (...args: unknown[]) => getCloudWatchDefaultRegionMock(...args),
  AWS_REGIONS: [
    { label: 'us-east-1', value: 'us-east-1' },
    { label: 'eu-west-2', value: 'eu-west-2' },
  ],
}));

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EdgeCard } from '../EdgeCard';
import { TopologyEdge, TopologyNode, DEFAULT_EDGE } from '../../../types';
import { EdgeEditSection } from '../../../utils/panelEvents';

function makeEdge(overrides: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    ...(DEFAULT_EDGE as TopologyEdge),
    id: 'e-1',
    sourceId: 'n-a',
    targetId: 'n-b',
    ...overrides,
  };
}

const NODES: TopologyNode[] = [
  { id: 'n-a', name: 'A', role: '', type: 'server', metrics: [], position: { x: 0, y: 0 }, compact: false },
  { id: 'n-b', name: 'B', role: '', type: 'server', metrics: [], position: { x: 0, y: 0 }, compact: false },
];

function mockDsType(type: string) {
  getDataSourceSrvMock.mockReturnValue({
    get: jest.fn().mockResolvedValue({ type }),
  });
}

beforeEach(() => {
  getDataSourceSrvMock.mockReset();
  // Default to a non-throwing stub so the target-query DS-detection effect
  // doesn't crash in tests that don't care about the ds type. Individual
  // tests call mockDsType() to pin the type for assertions.
  getDataSourceSrvMock.mockReturnValue({
    get: jest.fn().mockResolvedValue({ type: 'unknown' }),
  });
  fetchCwNamespacesMock.mockReset();
  fetchCwMetricsMock.mockReset();
  fetchCwDimensionKeysMock.mockReset();
  getCloudWatchDefaultRegionMock.mockReset();
  getCloudWatchDefaultRegionMock.mockReturnValue('us-east-1');
  fetchCwNamespacesMock.mockResolvedValue([]);
  fetchCwMetricsMock.mockResolvedValue([]);
  fetchCwDimensionKeysMock.mockResolvedValue([]);
});

function renderEdgeCard(
  edge: TopologyEdge,
  opts: { onChange?: jest.Mock; sectionHint?: EdgeEditSection } = {}
) {
  const onChange = opts.onChange ?? jest.fn();
  const result = render(
    <EdgeCard
      edge={edge}
      nodes={NODES}
      isOpen={true}
      onToggle={jest.fn()}
      onChange={onChange}
      onDelete={jest.fn()}
      sectionHint={opts.sectionHint}
    />
  );
  return { ...result, onChange };
}

describe('EdgeCard — dynamic targets toggle', () => {
  test('enabling seeds empty targetQuery and clears targetId', () => {
    const { onChange } = renderEdgeCard(makeEdge({ targetId: 'n-b' }));
    const toggle = screen.getByTestId('checkbox-use-dynamic-targets--discover-from-promql-query-');
    fireEvent.click(toggle);
    const lastCall = onChange.mock.calls.at(-1)![0] as TopologyEdge;
    expect(lastCall.targetQuery).toEqual({ datasourceUid: '', query: '', nodeIdLabel: '' });
    expect(lastCall.targetId).toBeUndefined();
  });

  test('disabling drops targetQuery entirely', () => {
    const { onChange } = renderEdgeCard(makeEdge({
      targetId: undefined,
      targetQuery: { datasourceUid: 'ds', query: 'up', nodeIdLabel: 'instance' },
    }));
    const toggle = screen.getByTestId('checkbox-use-dynamic-targets--discover-from-promql-query-');
    fireEvent.click(toggle);
    const lastCall = onChange.mock.calls.at(-1)![0] as TopologyEdge;
    expect(lastCall.targetQuery).toBeUndefined();
  });
});

describe('EdgeCard — dynamic target datasource switching', () => {
  test('Prometheus discovery query input appears when target-query DS is prometheus', async () => {
    mockDsType('prometheus');
    renderEdgeCard(makeEdge({
      targetQuery: { datasourceUid: 'ds-prom', query: 'up', nodeIdLabel: 'instance' },
    }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('up{job="myapp"}')).toBeInTheDocument();
    });
  });

  test('CloudWatch target-query shows namespace + metricName fields', async () => {
    mockDsType('cloudwatch');
    renderEdgeCard(makeEdge({
      targetQuery: {
        datasourceUid: 'ds-cw',
        query: '',
        nodeIdLabel: 'LoadBalancer',
        queryConfig: { namespace: 'AWS/ApplicationELB' },
      },
    }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('AWS/ApplicationELB')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('RequestCount')).toBeInTheDocument();
  });

  test('Infinity target-query shows url + method + root selector', async () => {
    mockDsType('yesoreyeram-infinity-datasource');
    renderEdgeCard(makeEdge({
      targetQuery: {
        datasourceUid: 'ds-inf',
        query: '',
        nodeIdLabel: 'hostname',
        queryConfig: { url: 'https://api.example.com/members', method: 'GET' },
      },
    }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://api.example.com/members')).toBeInTheDocument();
    });
    // Body textarea is only present for POST; verify absence for GET.
    expect(screen.queryByPlaceholderText('{"query": "..."}')).toBeNull();
  });
});

describe('EdgeCard — main metric CloudWatch autocomplete', () => {
  test('cascade: region → namespace → metric → dimension keys fetched in order', async () => {
    mockDsType('cloudwatch');
    fetchCwNamespacesMock.mockResolvedValue(['AWS/EC2', 'AWS/ApplicationELB']);
    fetchCwMetricsMock.mockResolvedValue(['CPUUtilization']);
    fetchCwDimensionKeysMock.mockResolvedValue(['InstanceId']);
    renderEdgeCard(
      makeEdge({
        metric: {
          datasourceUid: 'ds-cw',
          query: '',
          alias: 'load',
          queryConfig: { namespace: 'AWS/EC2', metricName: 'CPUUtilization' },
        },
      }),
      { sectionHint: 'metric' }
    );
    await waitFor(() => {
      expect(fetchCwNamespacesMock).toHaveBeenCalledWith('ds-cw', 'us-east-1', expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(fetchCwMetricsMock).toHaveBeenCalledWith('ds-cw', 'us-east-1', 'AWS/EC2', expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(fetchCwDimensionKeysMock).toHaveBeenCalledWith(
        'ds-cw', 'us-east-1', 'AWS/EC2', 'CPUUtilization', expect.any(AbortSignal)
      );
    });
  });
});

describe('EdgeCard — state map CRUD', () => {
  test('adding a state map row calls onChange with one entry', async () => {
    const { onChange } = renderEdgeCard(makeEdge(), { sectionHint: 'stateMap' });
    const addBtn = await screen.findByText('Add mapping');
    fireEvent.click(addBtn);
    // syncStateMap only persists rows whose key is non-empty; before the user
    // fills the key in, onChange with stateMap undefined is the expected shape.
    // So adding then setting a key should end with { key: color }.
    const inputs = screen.getAllByPlaceholderText('1');
    act(() => {
      fireEvent.change(inputs[inputs.length - 1], { target: { value: 'synced' } });
    });
    const lastCall = onChange.mock.calls.at(-1)![0] as TopologyEdge;
    expect(lastCall.stateMap).toEqual({ synced: 'green' });
  });

  test('changing color via Select updates the row', async () => {
    const { onChange } = renderEdgeCard(
      makeEdge({ stateMap: { synced: 'green' } }),
      { sectionHint: 'stateMap' }
    );
    // The state-map color Select sits next to the key input. STATE_MAP_COLORS
    // labels the green option "Green" (capitalised) even though the value
    // is 'green' — findByDisplayValue matches the displayed text, not the
    // raw value attribute.
    const colorSelect = await screen.findByDisplayValue('Green');
    act(() => {
      fireEvent.change(colorSelect, { target: { value: 'red' } });
    });
    const lastCall = onChange.mock.calls.at(-1)![0] as TopologyEdge;
    expect(lastCall.stateMap).toEqual({ synced: 'red' });
  });

  test('removing a row calls onChange with undefined stateMap (no keys left)', async () => {
    const { onChange } = renderEdgeCard(
      makeEdge({ stateMap: { synced: 'green' } }),
      { sectionHint: 'stateMap' }
    );
    const removeBtn = await screen.findByLabelText('Remove mapping');
    fireEvent.click(removeBtn);
    const lastCall = onChange.mock.calls.at(-1)![0] as TopologyEdge;
    expect(lastCall.stateMap).toBeUndefined();
  });
});

describe('EdgeCard — section hint routing', () => {
  test('sectionHint="thresholds" opens the Thresholds CollapsableSection', async () => {
    renderEdgeCard(makeEdge(), { sectionHint: 'thresholds' });
    await waitFor(() => {
      const thresholds = screen
        .getAllByTestId('collapsable')
        .find((el) => el.getAttribute('data-label')?.startsWith('Thresholds'));
      expect(thresholds).toBeDefined();
      expect(thresholds!.getAttribute('data-is-open')).toBe('true');
    });
  });

  test('sectionHint="visual" opens the Visual CollapsableSection', async () => {
    renderEdgeCard(makeEdge(), { sectionHint: 'visual' });
    await waitFor(() => {
      const visual = screen
        .getAllByTestId('collapsable')
        .find((el) => el.getAttribute('data-label') === 'Visual');
      expect(visual).toBeDefined();
      expect(visual!.getAttribute('data-is-open')).toBe('true');
    });
  });
});

describe('EdgeCard — thickness mode RadioButtonGroup', () => {
  test('clicking a thickness mode radio updates edge.thicknessMode', async () => {
    const { onChange } = renderEdgeCard(
      makeEdge({ thicknessMode: 'fixed' }),
      { sectionHint: 'visual' }
    );
    // Visual section is open via sectionHint. Click the "proportional" radio.
    const radio = await screen.findByTestId('radio-proportional');
    fireEvent.click(radio);
    const lastCall = onChange.mock.calls.at(-1)![0] as TopologyEdge;
    expect(lastCall.thicknessMode).toBe('proportional');
  });
});
