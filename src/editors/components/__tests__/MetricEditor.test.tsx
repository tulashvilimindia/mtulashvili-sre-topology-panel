// ─── Mock @grafana/ui primitives ─────────────────────────────────────
//
// MetricEditor pulls in heavy themed components from @grafana/ui. Replace
// them with lightweight React createElement stubs so tests exercise the
// component's own state management (DS type switching, CW autocomplete
// cascade, queryConfig delete-when-empty) without the real ui package.

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
        }),
        props.label
      ),
    // CollapsableSection renders children always (open state is not test-
    // critical for MetricEditor because the inner content is the focus).
    CollapsableSection: (props: { label?: React.ReactNode; isOpen?: boolean; onToggle?: () => void; children?: React.ReactNode }) =>
      React.createElement('section', { 'data-testid': 'collapsable' },
        React.createElement('button', { onClick: props.onToggle, type: 'button' }, props.label),
        React.createElement('div', {}, props.children)
      ),
    Select: (props: {
      options?: Array<{ label: string; value: string }>;
      value?: unknown;
      onChange?: (v: { value?: string }) => void;
      placeholder?: string;
      isClearable?: boolean;
      allowCustomValue?: boolean;
      isDisabled?: boolean;
      'data-testid'?: string;
    }) =>
      React.createElement('select', {
        'data-testid': props['data-testid'],
        value: (typeof props.value === 'string' ? props.value : (props.value as { value?: string })?.value) ?? '',
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => props.onChange?.({ value: e.target.value }),
        disabled: props.isDisabled,
      },
        React.createElement('option', { key: '__placeholder', value: '' }, props.placeholder ?? ''),
        (props.options ?? []).map((o) =>
          React.createElement('option', { key: o.value, value: o.value }, o.label ?? o.value)
        )
      ),
  };
});

// ─── Mock @grafana/runtime ───────────────────────────────────────────
const getDataSourceSrvMock = jest.fn();
jest.mock('@grafana/runtime', () => {
  const React = require('react');
  return {
    getDataSourceSrv: () => getDataSourceSrvMock(),
    DataSourcePicker: () => React.createElement('div', { 'data-testid': 'ds-picker' }),
  };
});

// ─── Mock cloudwatchResources fetchers ───────────────────────────────
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
    { label: 'ap-southeast-2', value: 'ap-southeast-2' },
  ],
}));

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MetricEditor } from '../MetricEditor';
import { NodeMetricConfig } from '../../../types';

function makeMetric(overrides: Partial<NodeMetricConfig> = {}): NodeMetricConfig {
  return {
    id: 'm1',
    label: 'cpu',
    datasourceUid: '',
    query: '',
    format: '${value}',
    section: 'General',
    isSummary: true,
    thresholds: [],
    showSparkline: false,
    ...overrides,
  };
}

function mockDsType(type: string) {
  getDataSourceSrvMock.mockReturnValue({
    get: jest.fn().mockResolvedValue({ type }),
  });
}

function mockFetchForPromLabels(names: string[]) {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: names }),
  });
}

beforeEach(() => {
  getDataSourceSrvMock.mockReset();
  fetchCwNamespacesMock.mockReset();
  fetchCwMetricsMock.mockReset();
  fetchCwDimensionKeysMock.mockReset();
  getCloudWatchDefaultRegionMock.mockReset();
  getCloudWatchDefaultRegionMock.mockReturnValue('us-east-1');
  fetchCwNamespacesMock.mockResolvedValue([]);
  fetchCwMetricsMock.mockResolvedValue([]);
  fetchCwDimensionKeysMock.mockResolvedValue([]);
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [] }),
  });
});

function renderMetricEditor(metric: NodeMetricConfig, onChange = jest.fn()) {
  const result = render(
    <MetricEditor
      metric={metric}
      isOpen={true}
      onToggle={jest.fn()}
      onChange={onChange}
      onDelete={jest.fn()}
    />
  );
  return { ...result, onChange };
}

describe('MetricEditor — Prometheus datasource', () => {
  test('queries /api/v1/label/__name__/values and populates metric-name Select', async () => {
    mockDsType('prometheus');
    mockFetchForPromLabels(['up', 'http_requests_total', 'node_cpu_seconds_total']);
    renderMetricEditor(makeMetric({ datasourceUid: 'ds-prom' }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/datasources/proxy/uid/ds-prom/api/v1/label/__name__/values'
      );
    });
    // The native-select stub renders an <option> per metric name.
    await waitFor(() => {
      expect(screen.getByText('http_requests_total')).toBeInTheDocument();
    });
    expect(screen.getByText('up')).toBeInTheDocument();
  });
});

describe('MetricEditor — CloudWatch datasource', () => {
  test('seeds region from getCloudWatchDefaultRegion on datasource detect', async () => {
    mockDsType('cloudwatch');
    getCloudWatchDefaultRegionMock.mockReturnValue('eu-west-2');
    renderMetricEditor(makeMetric({ datasourceUid: 'ds-cw' }));
    await waitFor(() => {
      expect(getCloudWatchDefaultRegionMock).toHaveBeenCalledWith('ds-cw');
    });
    // Effective region triggers namespace fetch with eu-west-2.
    await waitFor(() => {
      expect(fetchCwNamespacesMock).toHaveBeenCalledWith('ds-cw', 'eu-west-2', expect.any(AbortSignal));
    });
  });

  test('namespace selection triggers fetchCwMetrics with region+namespace', async () => {
    mockDsType('cloudwatch');
    fetchCwNamespacesMock.mockResolvedValue(['AWS/EC2', 'AWS/ApplicationELB']);
    const onChange = jest.fn();
    renderMetricEditor(
      makeMetric({ datasourceUid: 'ds-cw', queryConfig: { namespace: 'AWS/EC2' } }),
      onChange
    );
    await waitFor(() => {
      expect(fetchCwMetricsMock).toHaveBeenCalledWith('ds-cw', 'us-east-1', 'AWS/EC2', expect.any(AbortSignal));
    });
  });

  test('metric-name change triggers fetchCwDimensionKeys with all 3 args', async () => {
    mockDsType('cloudwatch');
    fetchCwNamespacesMock.mockResolvedValue(['AWS/EC2']);
    fetchCwMetricsMock.mockResolvedValue(['CPUUtilization', 'NetworkIn']);
    renderMetricEditor(makeMetric({
      datasourceUid: 'ds-cw',
      queryConfig: { namespace: 'AWS/EC2', metricName: 'CPUUtilization' },
    }));
    await waitFor(() => {
      expect(fetchCwDimensionKeysMock).toHaveBeenCalledWith(
        'ds-cw', 'us-east-1', 'AWS/EC2', 'CPUUtilization', expect.any(AbortSignal)
      );
    });
  });

  test('namespace fetch rejection renders error banner', async () => {
    mockDsType('cloudwatch');
    fetchCwNamespacesMock.mockRejectedValue(new Error('access denied'));
    renderMetricEditor(makeMetric({ datasourceUid: 'ds-cw' }));
    await waitFor(() => {
      expect(screen.getByText(/access denied/)).toBeInTheDocument();
    });
  });

  test('user region override supersedes datasource default', async () => {
    mockDsType('cloudwatch');
    renderMetricEditor(makeMetric({
      datasourceUid: 'ds-cw',
      queryConfig: { region: 'ap-southeast-2' },
    }));
    await waitFor(() => {
      expect(fetchCwNamespacesMock).toHaveBeenCalledWith('ds-cw', 'ap-southeast-2', expect.any(AbortSignal));
    });
  });

  test('updateQueryConfig drops the field when value is empty', async () => {
    mockDsType('cloudwatch');
    fetchCwNamespacesMock.mockResolvedValue(['AWS/EC2']);
    const onChange = jest.fn();
    renderMetricEditor(
      makeMetric({
        datasourceUid: 'ds-cw',
        queryConfig: { namespace: 'AWS/EC2' },
      }),
      onChange
    );
    await waitFor(() => expect(fetchCwNamespacesMock).toHaveBeenCalled());
    // Find the namespace select by its current value (fixture set it to AWS/EC2).
    // Avoids relying on sibling-select order, which can shift as the component grows.
    const namespaceSelect = screen.getByDisplayValue('AWS/EC2') as HTMLSelectElement;
    act(() => {
      fireEvent.change(namespaceSelect, { target: { value: '' } });
    });
    // onChange receives a metric whose queryConfig no longer has `namespace`.
    const lastCall = onChange.mock.calls.at(-1)![0] as NodeMetricConfig;
    expect(lastCall.queryConfig?.namespace).toBeUndefined();
  });

  test('CloudWatch editor surfaces metric-name options once fetched', async () => {
    mockDsType('cloudwatch');
    fetchCwNamespacesMock.mockResolvedValue(['AWS/EC2']);
    fetchCwMetricsMock.mockResolvedValue(['CPUUtilization', 'NetworkIn']);
    renderMetricEditor(makeMetric({
      datasourceUid: 'ds-cw',
      queryConfig: { namespace: 'AWS/EC2' },
    }));
    await waitFor(() => expect(screen.getByText('CPUUtilization')).toBeInTheDocument());
    expect(screen.getByText('NetworkIn')).toBeInTheDocument();
  });
});

describe('MetricEditor — Infinity datasource', () => {
  test('shows url and method fields; body textarea only for POST', async () => {
    mockDsType('yesoreyeram-infinity-datasource');
    const { rerender, onChange } = renderMetricEditor(
      makeMetric({ datasourceUid: 'ds-inf', queryConfig: { url: 'https://x.y', method: 'GET' } })
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://api.example.com/data')).toBeInTheDocument();
    });
    // No body textarea for GET.
    expect(screen.queryByPlaceholderText('{"query": "..."}')).toBeNull();

    // Switch to POST — body textarea appears.
    rerender(
      <MetricEditor
        metric={makeMetric({
          datasourceUid: 'ds-inf',
          queryConfig: { url: 'https://x.y', method: 'POST' },
        })}
        isOpen={true}
        onToggle={jest.fn()}
        onChange={onChange}
        onDelete={jest.fn()}
      />
    );
    expect(screen.getByPlaceholderText('{"query": "..."}')).toBeInTheDocument();
  });
});

describe('MetricEditor — generic fallback for other datasource types', () => {
  test('renders plain textarea + refId hint for unknown datasource type', async () => {
    mockDsType('loki');
    renderMetricEditor(makeMetric({ datasourceUid: 'ds-loki' }));
    // Placeholder uniquely identifies the generic-fallback textarea.
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Enter your loki query/)).toBeInTheDocument();
    });
    // The refId hint pointing users at panel-query binding appears
    // alongside the generic textarea (text "Panel query refId" — the
    // leading label. `getAllByText` used because the phrase also appears
    // inside the bottom hint line.)
    expect(screen.getAllByText(/Panel query refId/).length).toBeGreaterThanOrEqual(1);
  });
});
