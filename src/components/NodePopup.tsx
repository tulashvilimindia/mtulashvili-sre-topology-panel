import React, { useEffect, useState, useMemo } from 'react';
import { Icon, IconName } from '@grafana/ui';
import { TopologyNode, NodeMetricConfig, FiringAlert, STATUS_COLORS, ACCENT_COLOR } from '../types';

/**
 * Replace ${token} placeholders in a URL template with values from the node.
 * Source map: { ...node.alertLabelMatchers, name: node.name, id: node.id }.
 * Unknown tokens are left as-is so typos are visible to the user.
 */
function interpolateUrl(urlTemplate: string, node: TopologyNode): string {
  const ctx: Record<string, string> = {
    ...(node.alertLabelMatchers || {}),
    name: node.name,
    id: node.id,
  };
  return urlTemplate.replace(/\$\{([^}]+)\}/g, (match, key) => ctx[key] ?? match);
}

interface PopupProps {
  node: TopologyNode;
  position: { x: number; y: number };
  firingAlerts?: FiringAlert[];
  onClose: () => void;
}

interface TimeseriesPoint {
  timestamp: number;
  value: number;
}

interface MetricTimeseries {
  metricId: string;
  label: string;
  points: TimeseriesPoint[];
  current: number | null;
}

/** Fetch range query data for a metric over the last 1h */
async function fetchTimeseries(dsUid: string, query: string, signal?: AbortSignal): Promise<TimeseriesPoint[]> {
  if (!dsUid || !query) {
    return [];
  }
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 3600;
    const resp = await fetch(
      `/api/datasources/proxy/uid/${dsUid}/api/v1/query_range?` +
      new URLSearchParams({ query, start: String(start), end: String(end), step: '60' }),
      signal ? { signal } : undefined
    );
    if (!resp.ok) {
      return [];
    }
    const data = await resp.json();
    const result = data?.data?.result?.[0]?.values;
    if (!result) {
      return [];
    }
    return result.map((v: [number, string]) => ({ timestamp: v[0], value: parseFloat(v[1]) }))
      .filter((p: TimeseriesPoint) => !isNaN(p.value));
  } catch {
    return [];
  }
}

export const NodePopup: React.FC<PopupProps> = ({ node, position, firingAlerts, onClose }) => {
  const [seriesData, setSeriesData] = useState<MetricTimeseries[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable dependency: metric IDs string instead of array reference (CR-25)
  const metricIds = node.metrics.map((m) => m.id).join(',');

  // Fetch timeseries for all summary metrics (CR-15: with AbortController)
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);

    const fetchAll = async () => {
      const summaryMetrics = node.metrics.filter((m) => m.isSummary).slice(0, 4);
      const results: MetricTimeseries[] = [];

      for (const metric of summaryMetrics) {
        const points = await fetchTimeseries(metric.datasourceUid, metric.query, controller.signal);
        if (cancelled) {
          return;
        }
        results.push({
          metricId: metric.id,
          label: metric.label,
          points,
          current: points.length > 0 ? points[points.length - 1].value : null,
        });
      }

      if (!cancelled) {
        setSeriesData(results);
        setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; controller.abort(); };
    // metricIds is a stable hash of node.metrics[].id; node.metrics listed to satisfy exhaustive-deps
  }, [node.id, node.metrics, metricIds]);

  return (
    <div
      className="topology-popup"
      style={{ position: 'relative', left: 0, top: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="topology-popup-header">
        <span className="topology-popup-title">{node.name}</span>
        <button className="topology-popup-close" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      {node.observabilityLinks && node.observabilityLinks.length > 0 && (
        <div
          style={{
            padding: '6px 8px',
            borderBottom: '1px solid #2d3748',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
          }}
        >
          {node.observabilityLinks.map((link, i) => (
            <a
              key={`${link.label}-${i}`}
              href={interpolateUrl(link.url, node)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 3,
                background: '#5e81ac22',
                color: '#5e81ac',
                border: '1px solid #5e81ac44',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name={((link.icon || 'external-link-alt') as IconName)} size="xs" />
              {link.label}
            </a>
          ))}
        </div>
      )}
      {firingAlerts && firingAlerts.length > 0 && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid #2d3748' }}>
          <div style={{ fontSize: 10, color: '#616e88', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Firing alerts ({firingAlerts.length})
          </div>
          {firingAlerts.map((alert, i) => {
            const badgeColor = alert.state === 'firing' ? STATUS_COLORS.critical : STATUS_COLORS.warning;
            const ruleHref = alert.ruleUid
              ? `/alerting/grafana/${alert.ruleUid}/view`
              : `/alerting/list?search=${encodeURIComponent(alert.ruleName)}`;
            const summary = alert.annotations?.summary || alert.annotations?.description;
            const runbookUrl = alert.annotations?.runbook_url;
            return (
              <div key={`${alert.ruleName}-${i}`} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span
                    style={{
                      background: badgeColor + '22',
                      color: badgeColor,
                      border: `1px solid ${badgeColor}44`,
                      borderRadius: 2,
                      padding: '0 4px',
                      fontSize: 9,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                    }}
                  >
                    {alert.state}
                  </span>
                  <a
                    href={ruleHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: badgeColor,
                      textDecoration: 'none',
                      borderBottom: `1px dotted ${badgeColor}66`,
                    }}
                  >
                    {alert.ruleName}
                  </a>
                  {runbookUrl && (
                    <a
                      href={runbookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        marginLeft: 'auto',
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 2,
                        background: '#5e81ac22',
                        color: '#5e81ac',
                        border: '1px solid #5e81ac44',
                        textDecoration: 'none',
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                      }}
                    >
                      Runbook
                    </a>
                  )}
                </div>
                {summary && (
                  <div
                    style={{
                      fontSize: 10,
                      color: '#616e88',
                      marginLeft: 34,
                      marginTop: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 260,
                    }}
                    title={summary}
                  >
                    {summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {loading && <div className="topology-popup-loading">Loading trends...</div>}
      {!loading && seriesData.map((series) => (
        <div key={series.metricId} className="topology-popup-metric">
          <div className="topology-popup-metric-header">
            <span>{series.label}</span>
            <span className="topology-popup-metric-value">
              {series.current !== null ? series.current.toFixed(1) : 'N/A'}
            </span>
          </div>
          {series.points.length > 0 && (
            <MiniSparkline points={series.points} height={30} />
          )}
        </div>
      ))}
      {!loading && seriesData.length === 0 && (
        <div className="topology-popup-loading">No metrics configured</div>
      )}
    </div>
  );
};

/** Tiny SVG sparkline chart */
const MiniSparkline: React.FC<{ points: TimeseriesPoint[]; height: number }> = ({ points, height }) => {
  if (points.length < 2) {
    return null;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const range = max - min;
  const width = 200;

  const pathData = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.value - min) / range) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={pathData} fill="none" stroke={ACCENT_COLOR} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};
