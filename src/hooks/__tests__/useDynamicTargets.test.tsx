// Mock resolveDynamicTargets so the hook exercises its filter logic and
// poll interval without talking to real datasources.
const resolveDynamicTargetsMock = jest.fn();
jest.mock('../../utils/dynamicTargets', () => ({
  resolveDynamicTargets: (...args: unknown[]) => resolveDynamicTargetsMock(...args),
}));

import { renderHook, act } from '@testing-library/react';
import { useDynamicTargets } from '../useDynamicTargets';
import { TopologyEdge } from '../../types';

function edge(id: string, overrides: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    id,
    sourceId: 'src',
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
  resolveDynamicTargetsMock.mockReset();
  resolveDynamicTargetsMock.mockResolvedValue(new Map());
});

async function flushFetch() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useDynamicTargets', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('no edges with targetQuery → no fetch, empty map', async () => {
    const edges = [edge('e-static', { targetId: 'tgt' })];
    const { result } = renderHook(() => useDynamicTargets(edges));
    await flushFetch();
    expect(resolveDynamicTargetsMock).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  test('Prometheus-query dynamic edge is passed through to resolver', async () => {
    const edges = [edge('e-dyn', {
      targetQuery: { datasourceUid: 'ds', query: 'up', nodeIdLabel: 'instance' },
    })];
    resolveDynamicTargetsMock.mockResolvedValue(new Map([['e-dyn', ['host-a', 'host-b']]]));
    const { result } = renderHook(() => useDynamicTargets(edges));
    await flushFetch();
    expect(resolveDynamicTargetsMock).toHaveBeenCalledTimes(1);
    expect(result.current.get('e-dyn')).toEqual(['host-a', 'host-b']);
  });

  // Regression for useDynamicTargets.ts:18-20: the filter used to require
  // tq.query, which silently dropped every CloudWatch/Infinity dynamic edge.
  test('CloudWatch namespace+metricName dynamic edge is not filtered out', async () => {
    const edges = [edge('e-cw', {
      targetQuery: {
        datasourceUid: 'ds',
        query: '', // empty — would be dropped by the pre-fix filter
        nodeIdLabel: 'LoadBalancer',
        queryConfig: { namespace: 'AWS/ApplicationELB', metricName: 'RequestCount' },
      },
    })];
    resolveDynamicTargetsMock.mockResolvedValue(new Map([['e-cw', ['lb-1']]]));
    const { result } = renderHook(() => useDynamicTargets(edges));
    await flushFetch();
    expect(resolveDynamicTargetsMock).toHaveBeenCalledTimes(1);
    expect(result.current.get('e-cw')).toEqual(['lb-1']);
  });

  test('Infinity url dynamic edge is not filtered out', async () => {
    const edges = [edge('e-inf', {
      targetQuery: {
        datasourceUid: 'ds',
        query: '',
        nodeIdLabel: 'hostname',
        queryConfig: { url: 'https://api.example.com/members' },
      },
    })];
    resolveDynamicTargetsMock.mockResolvedValue(new Map([['e-inf', ['host-1']]]));
    const { result } = renderHook(() => useDynamicTargets(edges));
    await flushFetch();
    expect(resolveDynamicTargetsMock).toHaveBeenCalledTimes(1);
    expect(result.current.get('e-inf')).toEqual(['host-1']);
  });

  test('edges without datasourceUid or nodeIdLabel are filtered out', async () => {
    const edges = [
      edge('e-no-ds', {
        targetQuery: { datasourceUid: '', query: 'up', nodeIdLabel: 'instance' },
      }),
      edge('e-no-label', {
        targetQuery: { datasourceUid: 'ds', query: 'up', nodeIdLabel: '' },
      }),
    ];
    renderHook(() => useDynamicTargets(edges));
    await flushFetch();
    expect(resolveDynamicTargetsMock).not.toHaveBeenCalled();
  });

  test('re-polls every 60 seconds', async () => {
    const edges = [edge('e-dyn', {
      targetQuery: { datasourceUid: 'ds', query: 'up', nodeIdLabel: 'instance' },
    })];
    renderHook(() => useDynamicTargets(edges));
    await flushFetch();
    expect(resolveDynamicTargetsMock).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(59999); });
    expect(resolveDynamicTargetsMock).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(1); });
    expect(resolveDynamicTargetsMock).toHaveBeenCalledTimes(2);
  });

  test('unmount stops polling and aborts in-flight signal', async () => {
    let capturedSignal: AbortSignal | undefined;
    resolveDynamicTargetsMock.mockImplementation((_edges, signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise(() => { /* never resolves */ });
    });
    const edges = [edge('e-dyn', {
      targetQuery: { datasourceUid: 'ds', query: 'up', nodeIdLabel: 'instance' },
    })];
    const { unmount } = renderHook(() => useDynamicTargets(edges));
    expect(resolveDynamicTargetsMock).toHaveBeenCalledTimes(1);
    unmount();
    expect(capturedSignal!.aborted).toBe(true);
    act(() => { jest.advanceTimersByTime(120000); });
    expect(resolveDynamicTargetsMock).toHaveBeenCalledTimes(1);
  });
});
