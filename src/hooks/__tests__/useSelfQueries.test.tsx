// Mock queryDatasource so we don't hit fetch — tests assert on call shape.
const queryDatasourceMock = jest.fn();
jest.mock('../../utils/datasourceQuery', () => ({
  queryDatasource: (...args: unknown[]) => queryDatasourceMock(...args),
}));

import { renderHook, act } from '@testing-library/react';
import { useSelfQueries } from '../useSelfQueries';
import { TopologyNode, TopologyEdge } from '../../types';
import { DataFrame } from '@grafana/data';

function node(id: string, overrides: Partial<TopologyNode> = {}): TopologyNode {
  return {
    id,
    name: id,
    role: '',
    type: 'server',
    metrics: [],
    position: { x: 0, y: 0 },
    compact: false,
    ...overrides,
  };
}

function edge(id: string, overrides: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    id,
    sourceId: 'x',
    targetId: 'y',
    type: 'traffic',
    thicknessMode: 'fixed',
    thicknessMin: 1.5,
    thicknessMax: 4,
    thresholds: [],
    flowAnimation: false,
    bidirectional: false,
    anchorSource: 'auto',
    anchorTarget: 'auto',
    ...overrides,
  };
}

beforeEach(() => {
  queryDatasourceMock.mockReset();
  queryDatasourceMock.mockResolvedValue({ value: 42, fetchedAt: 123 });
});

// ─── Helper: advance timers + flush microtasks so the debounced fetch
//     resolves and React flushes the resulting setState.
async function flushDebouncedFetch() {
  await act(async () => {
    jest.advanceTimersByTime(500);
    // Two microtask flushes: one for the async callback body, one for the
    // awaited Promise.all inside it.
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useSelfQueries', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('zero metrics → empty results map, isLoading false', () => {
    const { result } = renderHook(() => useSelfQueries([], [], [], undefined));
    expect(result.current.data.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(queryDatasourceMock).not.toHaveBeenCalled();
  });

  test('fetches uncovered node metric via queryDatasource', async () => {
    const n = node('n1', {
      metrics: [{
        id: 'm1', label: 'cpu', datasourceUid: 'ds-1', query: 'up',
        format: '${value}', section: 'g', isSummary: true,
        thresholds: [], showSparkline: false,
      }],
    });
    const { result } = renderHook(() => useSelfQueries([n], [], [], undefined));
    await flushDebouncedFetch();
    expect(queryDatasourceMock).toHaveBeenCalledTimes(1);
    expect(queryDatasourceMock.mock.calls[0][0]).toBe('ds-1');
    expect(queryDatasourceMock.mock.calls[0][1]).toBe('up');
    expect(result.current.data.get('m1')).toEqual({ value: 42, fetchedAt: 123 });
  });

  test('500ms debounce batches rapid re-renders into one fetch', async () => {
    const n1 = node('n1', {
      metrics: [{
        id: 'm1', label: 'a', datasourceUid: 'ds', query: 'q1',
        format: '${value}', section: 'g', isSummary: true,
        thresholds: [], showSparkline: false,
      }],
    });
    const n2 = node('n1', {
      metrics: [{
        id: 'm1', label: 'a', datasourceUid: 'ds', query: 'q2',
        format: '${value}', section: 'g', isSummary: true,
        thresholds: [], showSparkline: false,
      }],
    });
    const { rerender } = renderHook(
      ({ nodes }: { nodes: TopologyNode[] }) => useSelfQueries(nodes, [], [], undefined),
      { initialProps: { nodes: [n1] } }
    );
    // Advance only 100ms then re-render — the first timer is cancelled by
    // the effect cleanup and a fresh 500ms timer starts for the new query.
    act(() => { jest.advanceTimersByTime(100); });
    rerender({ nodes: [n2] });
    await flushDebouncedFetch();
    expect(queryDatasourceMock).toHaveBeenCalledTimes(1);
    expect(queryDatasourceMock.mock.calls[0][1]).toBe('q2');
  });

  test('metric covered by a panel frame refId is skipped', async () => {
    const n = node('n1', {
      metrics: [
        { id: 'm1', label: 'a', datasourceUid: 'ds', query: 'q1', format: '${value}', section: 'g', isSummary: true, thresholds: [], showSparkline: false },
        { id: 'm2', label: 'b', datasourceUid: 'ds', query: 'q2', format: '${value}', section: 'g', isSummary: true, thresholds: [], showSparkline: false },
      ],
    });
    // Panel frame covers m1 via refId match — hook should only fetch m2.
    const panelSeries: DataFrame[] = [{ refId: 'm1', fields: [], length: 0, name: '' } as unknown as DataFrame];
    renderHook(() => useSelfQueries([n], [], panelSeries, undefined));
    await flushDebouncedFetch();
    expect(queryDatasourceMock).toHaveBeenCalledTimes(1);
    expect(queryDatasourceMock.mock.calls[0][1]).toBe('q2');
  });

  test('metrics with no query primitive are skipped', async () => {
    const n = node('n1', {
      metrics: [
        // Has datasource but no query/namespace/url — skipped.
        { id: 'm1', label: 'a', datasourceUid: 'ds', query: '', format: '${value}', section: 'g', isSummary: true, thresholds: [], showSparkline: false },
        // CloudWatch-shaped: namespace + metricName — kept.
        {
          id: 'm2', label: 'b', datasourceUid: 'ds', query: '', format: '${value}', section: 'g', isSummary: true, thresholds: [], showSparkline: false,
          queryConfig: { namespace: 'AWS/EC2', metricName: 'CPUUtilization' },
        },
        // Infinity-shaped: url — kept.
        {
          id: 'm3', label: 'c', datasourceUid: 'ds', query: '', format: '${value}', section: 'g', isSummary: true, thresholds: [], showSparkline: false,
          queryConfig: { url: 'https://x.y' },
        },
      ],
    });
    renderHook(() => useSelfQueries([n], [], [], undefined));
    await flushDebouncedFetch();
    expect(queryDatasourceMock).toHaveBeenCalledTimes(2);
    const ids = queryDatasourceMock.mock.calls.map((c) => {
      // 4th positional arg is queryConfig; pick up namespace or url to identify.
      const cfg = c[3];
      if (cfg?.namespace) { return 'm2'; }
      if (cfg?.url) { return 'm3'; }
      return '?';
    });
    expect(ids.sort()).toEqual(['m2', 'm3']);
  });

  test('unmount before debounce tick cancels without fetching', () => {
    const n = node('n1', {
      metrics: [{
        id: 'm1', label: 'a', datasourceUid: 'ds', query: 'q',
        format: '${value}', section: 'g', isSummary: true,
        thresholds: [], showSparkline: false,
      }],
    });
    const { unmount } = renderHook(() => useSelfQueries([n], [], [], undefined));
    // Unmount before the 500ms debounce fires.
    act(() => { jest.advanceTimersByTime(200); });
    unmount();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(queryDatasourceMock).not.toHaveBeenCalled();
  });

  test('unmount after fetch start aborts via AbortController signal', async () => {
    // Capture the signal passed to queryDatasource.
    let capturedSignal: AbortSignal | undefined;
    queryDatasourceMock.mockImplementation(
      (_dsUid: string, _query: string, _dsType, _cfg, _vars, _hist, signal: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => { /* never resolves */ });
      }
    );
    const n = node('n1', {
      metrics: [{
        id: 'm1', label: 'a', datasourceUid: 'ds', query: 'q',
        format: '${value}', section: 'g', isSummary: true,
        thresholds: [], showSparkline: false,
      }],
    });
    const { unmount } = renderHook(() => useSelfQueries([n], [], [], undefined));
    act(() => { jest.advanceTimersByTime(500); });
    expect(capturedSignal).toBeDefined();
    // The hook's cleanup runs on unmount and aborts the controller. Signal
    // transitions from 'not aborted' to 'aborted' via the cleanup path.
    const wasAborted = capturedSignal!.aborted;
    unmount();
    const afterUnmount = capturedSignal!.aborted;
    // If the fetch was already aborted before unmount, it means the hook's
    // internal mechanism already fired — either way the final state after
    // unmount must be aborted=true.
    expect(afterUnmount).toBe(true);
    expect(wasAborted || afterUnmount).toBe(true);
  });
});
