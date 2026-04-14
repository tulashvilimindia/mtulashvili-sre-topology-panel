// Mock @grafana/runtime BEFORE importing the module under test
jest.mock('@grafana/runtime', () => ({
  getDataSourceSrv: jest.fn(),
}));

import { getDataSourceSrv } from '@grafana/runtime';
import {
  queryDatasource,
  queryDatasourceRange,
  detectDatasourceType,
} from '../datasourceQuery';

const mockGetDataSourceSrv = getDataSourceSrv as jest.Mock;

function mockDsType(type: string): void {
  mockGetDataSourceSrv.mockReturnValue({
    getInstanceSettings: jest.fn().mockReturnValue({ type }),
  });
}

function mockFetchOk(body: unknown): void {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

function mockFetchError(status: number): void {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  });
}

describe('detectDatasourceType', () => {
  test('returns datasource type for known uid', () => {
    mockDsType('prometheus');
    expect(detectDatasourceType('uid-1')).toBe('prometheus');
  });

  test('returns unknown when getInstanceSettings returns null', () => {
    mockGetDataSourceSrv.mockReturnValue({
      getInstanceSettings: jest.fn().mockReturnValue(null),
    });
    expect(detectDatasourceType('uid-1')).toBe('unknown');
  });

  test('returns unknown when getDataSourceSrv throws', () => {
    mockGetDataSourceSrv.mockImplementation(() => {
      throw new Error('srv unavailable');
    });
    expect(detectDatasourceType('uid-1')).toBe('unknown');
  });
});

describe('queryDatasource — Prometheus path', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDsType('prometheus');
  });
  afterEach(() => { warnSpy.mockRestore(); jest.restoreAllMocks(); });

  test('parses numeric value from Prometheus instant query', async () => {
    mockFetchOk({
      data: {
        result: [{ metric: {}, value: [1234567890, '42.5'] }],
      },
    });
    const result = await queryDatasource('uid-1', 'up');
    expect(result).toMatchObject({ value: 42.5 });
  });

  test('stamps fetchedAt on successful result', async () => {
    mockFetchOk({
      data: { result: [{ metric: {}, value: [1234567890, '1'] }] },
    });
    const before = Date.now();
    const result = await queryDatasource('uid-1', 'up');
    const after = Date.now();
    expect(result.fetchedAt).toBeDefined();
    expect(result.fetchedAt!).toBeGreaterThanOrEqual(before);
    expect(result.fetchedAt!).toBeLessThanOrEqual(after);
  });

  test('stamps fetchedAt on error result as well', async () => {
    mockFetchError(500);
    const result = await queryDatasource('uid-1', 'up');
    expect(result.error).toBe('http');
    expect(result.fetchedAt).toBeDefined();
    expect(typeof result.fetchedAt).toBe('number');
  });


  test('empty result returns null value with no error', async () => {
    mockFetchOk({ data: { result: [] } });
    const result = await queryDatasource('uid-1', 'up');
    expect(result).toMatchObject({ value: null });
  });

  test('http error returns error http', async () => {
    mockFetchError(502);
    const result = await queryDatasource('uid-1', 'up');
    expect(result).toMatchObject({ value: null, error: 'http' });
    expect(warnSpy).toHaveBeenCalled();
  });

  test('parse error on NaN value', async () => {
    mockFetchOk({
      data: { result: [{ metric: {}, value: [1234567890, 'not-a-number'] }] },
    });
    const result = await queryDatasource('uid-1', 'up');
    expect(result).toMatchObject({ value: null, error: 'parse' });
  });

  test('network error returns error network', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('offline'));
    const result = await queryDatasource('uid-1', 'up');
    expect(result).toMatchObject({ value: null, error: 'network' });
    expect(warnSpy).toHaveBeenCalled();
  });

  test('AbortError is silently swallowed as empty (no warn, no error flag)', async () => {
    const ae = new Error('aborted');
    ae.name = 'AbortError';
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(ae);
    const result = await queryDatasource('uid-1', 'up');
    expect(result).toMatchObject({ value: null });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('historicalTime adds time param to URL', async () => {
    mockFetchOk({ data: { result: [{ value: [0, '1'] }] } });
    await queryDatasource('uid-1', 'up', undefined, undefined, undefined, 1234567890);
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('time=1234567890');
  });
});

describe('queryDatasource — CloudWatch path', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDsType('cloudwatch');
  });
  afterEach(() => { warnSpy.mockRestore(); jest.restoreAllMocks(); });

  test('returns null with no error when required config is missing', async () => {
    const result = await queryDatasource('uid-1', '', undefined, {});
    expect(result).toMatchObject({ value: null });
  });

  test('parses last value from a valid CloudWatch response', async () => {
    mockFetchOk({
      results: {
        A: {
          frames: [
            { data: { values: [[1000, 2000, 3000], [1, 2, 3]] } },
          ],
        },
      },
    });
    const result = await queryDatasource('uid-1', '', undefined, {
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      dimensions: { LoadBalancer: 'app/abc' },
    });
    expect(result).toMatchObject({ value: 3 });
  });

  test('empty frames returns null without error', async () => {
    mockFetchOk({ results: { A: { frames: [] } } });
    const result = await queryDatasource('uid-1', '', undefined, {
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
    });
    expect(result).toMatchObject({ value: null });
  });

  test('http error returns error http', async () => {
    mockFetchError(500);
    const result = await queryDatasource('uid-1', '', undefined, {
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
    });
    expect(result).toMatchObject({ value: null, error: 'http' });
  });

  test('parse error when last value is non-numeric', async () => {
    mockFetchOk({
      results: { A: { frames: [{ data: { values: [[1000, 2000], [1, 'not-a-number']] } }] } },
    });
    const result = await queryDatasource('uid-1', '', undefined, {
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
    });
    expect(result).toMatchObject({ value: null, error: 'parse' });
  });

  test('network error returns error network', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('timeout'));
    const result = await queryDatasource('uid-1', '', undefined, {
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
    });
    expect(result).toMatchObject({ value: null, error: 'network' });
  });

  test('values array too short returns null without error', async () => {
    mockFetchOk({
      results: { A: { frames: [{ data: { values: [[1000]] } }] } },
    });
    const result = await queryDatasource('uid-1', '', undefined, {
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
    });
    expect(result).toMatchObject({ value: null });
  });
});

describe('queryDatasource — Infinity path', () => {
  beforeEach(() => { mockDsType('yesoreyeram-infinity-datasource'); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('returns null with no error when url is missing', async () => {
    const result = await queryDatasource('uid-1', '', undefined, {});
    expect(result).toMatchObject({ value: null });
  });

  test('parses first value from frame data', async () => {
    mockFetchOk({
      results: {
        A: {
          frames: [{ data: { values: [['42.7']] } }],
        },
      },
    });
    const result = await queryDatasource('uid-1', '', undefined, { url: 'https://x.y' });
    expect(result).toMatchObject({ value: 42.7 });
  });

  test('falls back to meta.custom.data.value when frame values are empty', async () => {
    mockFetchOk({
      results: {
        A: {
          frames: [{ data: { values: [[]] }, schema: { meta: { custom: { data: { value: 99 } } } } }],
        },
      },
    });
    const result = await queryDatasource('uid-1', '', undefined, { url: 'https://x.y' });
    expect(result).toMatchObject({ value: 99 });
  });

  test('http error returns error http', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetchError(500);
    const result = await queryDatasource('uid-1', '', undefined, { url: 'https://x.y' });
    expect(result).toMatchObject({ value: null, error: 'http' });
  });

  test('parse error on non-numeric first value', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetchOk({
      results: { A: { frames: [{ data: { values: [['not-a-number']] } }] } },
    });
    const result = await queryDatasource('uid-1', '', undefined, { url: 'https://x.y' });
    expect(result).toMatchObject({ value: null, error: 'parse' });
  });

  test('network error returns error network', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('offline'));
    const result = await queryDatasource('uid-1', '', undefined, { url: 'https://x.y' });
    expect(result).toMatchObject({ value: null, error: 'network' });
  });

  test('empty frames returns null without error', async () => {
    mockFetchOk({ results: { A: { frames: [] } } });
    const result = await queryDatasource('uid-1', '', undefined, { url: 'https://x.y' });
    expect(result).toMatchObject({ value: null });
  });
});

describe('queryDatasourceRange', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  test('Prometheus returns timeseries points from query_range', async () => {
    mockDsType('prometheus');
    mockFetchOk({
      data: {
        result: [{ values: [[1000, '10'], [2000, '20'], [3000, '30']] }],
      },
    });
    const points = await queryDatasourceRange('uid-1', 'up');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ timestamp: 1000, value: 10 });
    expect(points[2]).toEqual({ timestamp: 3000, value: 30 });
  });

  test('Prometheus handles empty result', async () => {
    mockDsType('prometheus');
    mockFetchOk({ data: { result: [] } });
    const points = await queryDatasourceRange('uid-1', 'up');
    expect(points).toEqual([]);
  });

  test('CloudWatch returns timeseries points from frames', async () => {
    mockDsType('cloudwatch');
    mockFetchOk({
      results: {
        A: {
          frames: [{ data: { values: [[1000, 2000], [10, 20]] } }],
        },
      },
    });
    const points = await queryDatasourceRange('uid-1', '', { namespace: 'AWS/EC2', metricName: 'CPUUtilization' });
    expect(points).toHaveLength(2);
  });

  test('CloudWatch normalises millisecond timestamps to seconds', async () => {
    mockDsType('cloudwatch');
    const msTimestamp = 1700000000000; // 13 digits = milliseconds
    mockFetchOk({
      results: {
        A: {
          frames: [{ data: { values: [[msTimestamp], [42]] } }],
        },
      },
    });
    const points = await queryDatasourceRange('uid-1', '', { namespace: 'AWS/EC2', metricName: 'CPUUtilization' });
    expect(points[0].timestamp).toBe(Math.floor(msTimestamp / 1000));
  });

  test('Infinity returns empty array (no natural time series)', async () => {
    mockDsType('yesoreyeram-infinity-datasource');
    const points = await queryDatasourceRange('uid-1', 'ignored');
    expect(points).toEqual([]);
  });

  test('Prometheus range http error returns empty', async () => {
    mockDsType('prometheus');
    mockFetchError(502);
    const points = await queryDatasourceRange('uid-1', 'up');
    expect(points).toEqual([]);
  });

  test('Prometheus range missing query returns empty', async () => {
    mockDsType('prometheus');
    const points = await queryDatasourceRange('uid-1', '');
    expect(points).toEqual([]);
  });

  test('Prometheus range network error returns empty', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDsType('prometheus');
    (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(new Error('net'));
    const points = await queryDatasourceRange('uid-1', 'up');
    expect(points).toEqual([]);
  });

  test('CloudWatch range missing config returns empty', async () => {
    mockDsType('cloudwatch');
    const points = await queryDatasourceRange('uid-1', '', {});
    expect(points).toEqual([]);
  });

  test('CloudWatch range http error returns empty', async () => {
    mockDsType('cloudwatch');
    mockFetchError(500);
    const points = await queryDatasourceRange('uid-1', '', { namespace: 'X', metricName: 'Y' });
    expect(points).toEqual([]);
  });

  test('CloudWatch range empty frames returns empty', async () => {
    mockDsType('cloudwatch');
    mockFetchOk({ results: { A: { frames: [] } } });
    const points = await queryDatasourceRange('uid-1', '', { namespace: 'X', metricName: 'Y' });
    expect(points).toEqual([]);
  });

  test('unknown datasource type falls back to Prometheus range', async () => {
    mockDsType('unknown-type');
    mockFetchOk({ data: { result: [{ values: [[1000, '5']] }] } });
    const points = await queryDatasourceRange('uid-1', 'up');
    expect(points).toHaveLength(1);
  });
});
