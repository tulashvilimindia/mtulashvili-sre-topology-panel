/**
 * dynamicTargets.ts — Resolve DynamicTargetQuery edges to concrete target lists
 *
 * Pure utility: no React, no state, no side effects beyond fetch.
 *
 * Used by useDynamicTargets in TopologyPanel to expand a single edge with a
 * `targetQuery` field into N virtual edges, one per distinct label value the
 * query returns. This lets users declare "edge from pool → each live member"
 * without hand-listing every member in the topology config.
 *
 * 3.1a scope: Prometheus-only. 3.1b will extend to CloudWatch and Infinity.
 *
 * Never throws EXCEPT on AbortError (rethrown so callers can distinguish
 * intentional cleanup from real failures).
 */

import { TopologyEdge } from '../types';

/**
 * Run a PromQL query and extract distinct values of a given label from the
 * results. Used for pool-member-style discovery:
 *   query: `up{job="myapp"}`
 *   nodeIdLabel: `instance`
 *   → returns the list of instances currently reporting via the `up` metric.
 */
export async function resolvePrometheusTargets(
  dsUid: string,
  promQlQuery: string,
  nodeIdLabel: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!dsUid || !promQlQuery || !nodeIdLabel) {
    return [];
  }
  try {
    const resp = await fetch(
      `/api/datasources/proxy/uid/${dsUid}/api/v1/query?query=${encodeURIComponent(promQlQuery)}`,
      signal ? { signal } : undefined
    );
    if (!resp.ok) {
      console.warn('[topology] dynamic target resolve http error', { dsUid, status: resp.status });
      return [];
    }
    const data = await resp.json();
    const results = data?.data?.result;
    if (!Array.isArray(results)) {
      return [];
    }
    const seen = new Set<string>();
    for (const row of results) {
      const value = row?.metric?.[nodeIdLabel];
      if (typeof value === 'string' && value) {
        seen.add(value);
      }
    }
    return Array.from(seen);
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw err;
    }
    console.warn('[topology] dynamic target resolve network error', { dsUid, err });
    return [];
  }
}

/**
 * Resolve every edge with a `targetQuery` to its list of discovered target values.
 * Returns a map of parent-edge-id → array of target values.
 *
 * 3.1a: assumes every `targetQuery.datasourceUid` points to a Prometheus datasource.
 * Non-Prometheus targets will still route through resolvePrometheusTargets (which
 * will likely return []), degrading gracefully. 3.1b will detect the datasource
 * type and route to the correct resolver.
 */
export async function resolveDynamicTargets(
  edges: TopologyEdge[],
  signal?: AbortSignal
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const dynamicEdges = edges.filter((e) => e.targetQuery && e.targetQuery.datasourceUid && e.targetQuery.query && e.targetQuery.nodeIdLabel);
  if (dynamicEdges.length === 0) {
    return result;
  }

  await Promise.all(
    dynamicEdges.map(async (edge) => {
      const tq = edge.targetQuery!;
      const values = await resolvePrometheusTargets(tq.datasourceUid, tq.query, tq.nodeIdLabel, signal);
      result.set(edge.id, values);
    })
  );
  return result;
}
