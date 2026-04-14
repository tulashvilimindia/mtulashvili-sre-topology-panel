import { useEffect, useMemo, useRef, useState } from 'react';
import { TopologyEdge } from '../types';
import { resolveDynamicTargets } from '../utils/dynamicTargets';

/**
 * Polls datasources for every edge that has a targetQuery, resolving to
 * a list of discovered node ids per edge. Used to expand 1-to-N edges
 * (e.g. load-balancer pool members) into virtual edges without persisting
 * them into dashboard JSON.
 *
 * Polls every 60s. Edges without a targetQuery are skipped.
 */
export function useDynamicTargets(edges: TopologyEdge[]): Map<string, string[]> {
  const [targetsByEdge, setTargetsByEdge] = useState<Map<string, string[]>>(new Map());

  // Only edges opted-in via targetQuery trigger polling
  const dynamicEdges = useMemo(
    () => edges.filter((e) => e.targetQuery && e.targetQuery.datasourceUid && e.targetQuery.query && e.targetQuery.nodeIdLabel),
    [edges]
  );

  // Avoid adding targetsByEdge to deps (would cause infinite loop)
  const hasResultsRef = useRef(false);
  hasResultsRef.current = targetsByEdge.size > 0;

  useEffect(() => {
    if (dynamicEdges.length === 0) {
      if (hasResultsRef.current) {
        setTargetsByEdge(new Map());
      }
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const next = await resolveDynamicTargets(dynamicEdges, controller.signal);
        if (!cancelled) {
          setTargetsByEdge(next);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[topology] useDynamicTargets run failed', err);
        }
      }
    };

    run();
    const interval = setInterval(run, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      controller.abort();
    };
  }, [dynamicEdges]);

  return targetsByEdge;
}
