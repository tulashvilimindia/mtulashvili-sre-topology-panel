import React, { useEffect, useState, useMemo } from 'react';
import { TopologyNode, NodeMetricConfig, STATUS_COLORS } from '../types';

interface PopupProps {
  node: TopologyNode;
  position: { x: number; y: number };
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
async function fetchTimeseries(dsUid: string, query: string): Promise<TimeseriesPoint[]> {
  if (!dsUid || !query) {
    return [];
  }
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 3600;
    const resp = await fetch(
      `/api/datasources/proxy/uid/${dsUid}/api/v1/query_range?` +
      new URLSearchParams({ query, start: String(start), end: String(end), step: '60' })
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

export const NodePopup: React.FC<PopupProps> = ({ node, position, onClose }) => {
  const [seriesData, setSeriesData] = useState<MetricTimeseries[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch timeseries for all summary metrics
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchAll = async () => {
      const summaryMetrics = node.metrics.filter((m) => m.isSummary).slice(0, 4);
      const results: MetricTimeseries[] = [];

      for (const metric of summaryMetrics) {
        const points = await fetchTimeseries(metric.datasourceUid, metric.query);
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
    return () => { cancelled = true; };
  }, [node.id, node.metrics]);

  return (
    <div
      className="topology-popup"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="topology-popup-header">
        <span className="topology-popup-title">{node.name}</span>
        <span className="topology-popup-close" onClick={onClose}>x</span>
      </div>
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
      <path d={pathData} fill="none" stroke="#5e81ac" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};
