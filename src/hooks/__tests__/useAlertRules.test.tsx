// Mock the underlying alert-rules utils so the hook exercises its poll,
// clamp, and matcher-filter logic without hitting fetch.
const fetchAlertRulesMock = jest.fn();
const matchAlertsToNodeMock = jest.fn();
jest.mock('../../utils/alertRules', () => ({
  fetchAlertRules: (...args: unknown[]) => fetchAlertRulesMock(...args),
  matchAlertsToNode: (...args: unknown[]) => matchAlertsToNodeMock(...args),
}));

import { renderHook, act } from '@testing-library/react';
import { useAlertRules } from '../useAlertRules';
import { TopologyNode, FiringAlert } from '../../types';

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

beforeEach(() => {
  fetchAlertRulesMock.mockReset();
  matchAlertsToNodeMock.mockReset();
  fetchAlertRulesMock.mockResolvedValue({ alerts: [], fetchedAt: 0 });
  matchAlertsToNodeMock.mockReturnValue([]);
});

async function flushFetch() {
  // Two flushes: one for the fetchAlertRules promise, one for the
  // matchAlertsToNode → setAlertsByNode path inside the effect.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAlertRules', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('no nodes with matchers → no fetch, empty result map', async () => {
    const nodes = [node('n1'), node('n2', { alertLabelMatchers: {} })];
    const { result } = renderHook(() => useAlertRules(nodes, 10000));
    await flushFetch();
    expect(fetchAlertRulesMock).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  test('one node with matchers triggers fetch + result map keyed on node id', async () => {
    const alerts: FiringAlert[] = [{ ruleName: 'R', state: 'firing', labels: {} }];
    fetchAlertRulesMock.mockResolvedValue({ alerts, fetchedAt: 1 });
    matchAlertsToNodeMock.mockReturnValue(alerts);
    const nodes = [node('n1', { alertLabelMatchers: { instance: 'web-01' } })];
    const { result } = renderHook(() => useAlertRules(nodes, 30000));
    await flushFetch();
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(1);
    expect(result.current.get('n1')).toEqual(alerts);
  });

  test('pollIntervalMs below 5000 is clamped to 5000 (anti-DoS guard)', async () => {
    const nodes = [node('n1', { alertLabelMatchers: { k: 'v' } })];
    renderHook(() => useAlertRules(nodes, 100));
    await flushFetch();
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(1);
    // Advance just under the clamped 5000ms interval — no second poll.
    act(() => { jest.advanceTimersByTime(4999); });
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(1);
    // One more millisecond → clamped interval fires.
    act(() => { jest.advanceTimersByTime(1); });
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(2);
  });

  test('pollIntervalMs above 5000 is honoured', async () => {
    const nodes = [node('n1', { alertLabelMatchers: { k: 'v' } })];
    renderHook(() => useAlertRules(nodes, 10000));
    await flushFetch();
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(9999); });
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(1); });
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(2);
  });

  test('unmount stops polling and aborts the in-flight signal', async () => {
    let capturedSignal: AbortSignal | undefined;
    fetchAlertRulesMock.mockImplementation((signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise(() => { /* never resolves */ });
    });
    const nodes = [node('n1', { alertLabelMatchers: { k: 'v' } })];
    const { unmount } = renderHook(() => useAlertRules(nodes, 10000));
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(1);
    expect(capturedSignal).toBeDefined();
    unmount();
    expect(capturedSignal!.aborted).toBe(true);
    // Further ticks after unmount must not trigger a new poll.
    act(() => { jest.advanceTimersByTime(30000); });
    expect(fetchAlertRulesMock).toHaveBeenCalledTimes(1);
  });
});
