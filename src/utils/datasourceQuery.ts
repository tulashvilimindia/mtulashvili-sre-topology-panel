/**
 * datasourceQuery.ts — Datasource-agnostic query abstraction
 *
 * Pure utility: no React, no state, no side effects beyond fetch.
 * Supports Prometheus, CloudWatch, and Infinity (NR/Kibana/CF) datasources.
 * Always returns number | null, never throws.
 */

import { getDataSourceSrv } from '@grafana/runtime';
import { DatasourceQueryConfig } from '../types';

/** Result of a single metric query */
export interface QueryResult {
  value: number | null;
}

/**
 * Detect datasource type by UID using Grafana's DataSourceSrv.
 * Returns the type string (e.g. 'prometheus', 'cloudwatch', 'yesoreyeram-infinity-datasource')
 * or 'unknown' if not found.
 */
export function detectDatasourceType(dsUid: string): string {
  try {
    const settings = getDataSourceSrv().getInstanceSettings(dsUid);
    return settings?.type || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Query a datasource and return a single numeric value.
 * Routes to the correct API based on datasource type.
 *
 * @param dsUid - Datasource UID
 * @param query - Query expression (PromQL for Prometheus, metric name for CloudWatch)
 * @param dsType - Optional type hint (auto-detected if not provided)
 * @param queryConfig - Optional config for CloudWatch/Infinity queries
 * @param replaceVars - Optional template variable interpolation function
 * @param historicalTime - Optional Unix timestamp for time travel queries
 */
export async function queryDatasource(
  dsUid: string,
  query: string,
  dsType?: string,
  queryConfig?: DatasourceQueryConfig,
  replaceVars?: (value: string) => string,
  historicalTime?: number
): Promise<number | null> {
  const type = dsType || detectDatasourceType(dsUid);
  const interpolatedQuery = replaceVars ? replaceVars(query) : query;

  switch (type) {
    case 'prometheus':
      return queryPrometheus(dsUid, interpolatedQuery, historicalTime);
    case 'cloudwatch':
      return queryCloudWatch(dsUid, queryConfig);
    case 'yesoreyeram-infinity-datasource':
      return queryInfinity(dsUid, queryConfig);
    default:
      return queryPrometheus(dsUid, interpolatedQuery, historicalTime);
  }
}

/**
 * Query Prometheus via datasource proxy API.
 * Uses instant query endpoint, returns the latest value.
 */
async function queryPrometheus(dsUid: string, query: string, historicalTime?: number): Promise<number | null> {
  try {
    const params: Record<string, string> = { query };
    if (historicalTime) {
      params.time = String(historicalTime);
    }
    const resp = await fetch(
      `/api/datasources/proxy/uid/${dsUid}/api/v1/query?` +
      new URLSearchParams(params)
    );
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    const results = data?.data?.result;
    if (!results || results.length === 0) {
      return null;
    }
    const val = parseFloat(results[0].value[1]);
    return isNaN(val) ? null : val;
  } catch {
    return null;
  }
}

/**
 * Query CloudWatch via Grafana's unified /api/ds/query endpoint.
 * Requires queryConfig with namespace, metricName, dimensions, stat, period.
 */
async function queryCloudWatch(
  dsUid: string,
  config?: DatasourceQueryConfig
): Promise<number | null> {
  if (!config?.namespace || !config?.metricName) {
    return null;
  }
  try {
    const dimensions: Record<string, string[]> = {};
    if (config.dimensions) {
      for (const [key, val] of Object.entries(config.dimensions)) {
        dimensions[key] = [val];
      }
    }

    const resp = await fetch('/api/ds/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: [{
          refId: 'A',
          datasource: { uid: dsUid, type: 'cloudwatch' },
          type: 'timeSeriesQuery',
          namespace: config.namespace,
          metricName: config.metricName,
          dimensions,
          statistic: config.stat || 'Average',
          period: String(config.period || 300),
          region: 'default',
        }],
        from: 'now-5m',
        to: 'now',
      }),
    });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    const frames = data?.results?.A?.frames;
    if (!frames || frames.length === 0) {
      return null;
    }
    const values = frames[0]?.data?.values;
    if (!values || values.length < 2 || values[1].length === 0) {
      return null;
    }
    // Last value in the time series
    const val = values[1][values[1].length - 1];
    return typeof val === 'number' && !isNaN(val) ? val : null;
  } catch {
    return null;
  }
}

/**
 * Query Infinity datasource via Grafana's /api/ds/query endpoint.
 * Requires queryConfig with url, rootSelector, and optionally body/method.
 */
async function queryInfinity(
  dsUid: string,
  config?: DatasourceQueryConfig
): Promise<number | null> {
  if (!config?.url) {
    return null;
  }
  try {
    const urlOptions: Record<string, string> = {
      method: config.method || 'GET',
    };
    if (config.body) {
      urlOptions.body_type = 'raw';
      urlOptions.body_content_type = 'application/json';
      urlOptions.data = config.body;
    }

    const resp = await fetch('/api/ds/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: [{
          refId: 'A',
          datasource: { uid: dsUid, type: 'yesoreyeram-infinity-datasource' },
          type: 'json',
          parser: 'backend',
          source: 'url',
          url: config.url,
          root_selector: config.rootSelector || '',
          url_options: urlOptions,
          columns: [{ selector: 'value', text: 'Value', type: 'number' }],
        }],
        from: 'now-5m',
        to: 'now',
      }),
    });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    const frames = data?.results?.A?.frames;
    if (!frames || frames.length === 0) {
      return null;
    }
    const values = frames[0]?.data?.values;
    if (values && values[0] && values[0].length > 0) {
      const val = parseFloat(values[0][0]);
      return isNaN(val) ? null : val;
    }
    // Fallback: check meta.custom.data for raw response
    const rawData = frames[0]?.schema?.meta?.custom?.data;
    if (typeof rawData === 'number') {
      return rawData;
    }
    if (typeof rawData === 'object' && rawData !== null) {
      // Try common response shapes
      const candidate = rawData.value ?? rawData.count ?? rawData.result;
      if (typeof candidate === 'number') {
        return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}
