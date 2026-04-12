import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { CollapsableSection, Input, Checkbox, IconButton, Select } from '@grafana/ui';
import { DataSourcePicker, getDataSourceSrv } from '@grafana/runtime';
import { NodeMetricConfig } from '../../types';
import { ThresholdList } from './ThresholdList';
import '../editors.css';

interface Props {
  metric: NodeMetricConfig;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (updated: NodeMetricConfig) => void;
  onDelete: () => void;
}

export const MetricEditor: React.FC<Props> = ({ metric, isOpen, onToggle, onChange, onDelete }) => {
  const [availableMetrics, setAvailableMetrics] = useState<Array<{ label: string; value: string }>>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const handleField = useCallback(
    <K extends keyof NodeMetricConfig>(field: K, value: NodeMetricConfig[K]) => {
      onChange({ ...metric, [field]: value });
    },
    [metric, onChange]
  );

  // When datasource changes, discover available metric names
  useEffect(() => {
    if (!metric.datasourceUid) {
      setAvailableMetrics([]);
      return;
    }

    let cancelled = false;
    setLoadingMetrics(true);

    const fetchMetrics = async () => {
      try {
        const ds = await getDataSourceSrv().get(metric.datasourceUid);
        if (cancelled) {return;}

        // Query Prometheus label values for __name__
        if (ds.type === 'prometheus') {
          const response = await fetch(
            `/api/datasources/proxy/uid/${metric.datasourceUid}/api/v1/label/__name__/values`
          );
          if (cancelled) {return;}
          const data = await response.json();
          const names: string[] = data?.data || [];
          setAvailableMetrics(names.map((n) => ({ label: n, value: n })));
        }
      } catch {
        // Silently fail — user can still type manually
      } finally {
        if (!cancelled) {
          setLoadingMetrics(false);
        }
      }
    };

    fetchMetrics();
    return () => { cancelled = true; };
  }, [metric.datasourceUid]);

  // Existing sections used by sibling metrics (for Section dropdown)
  const sectionOptions = useMemo(() => {
    const common = ['System', 'Traffic', 'Performance', 'Security', 'TMM', 'VS', 'IIS', 'Pool', 'Monitor', 'HA', 'Connections', 'General'];
    return common.map((s) => ({ label: s, value: s }));
  }, []);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      <span>{metric.label || 'metric'}</span>
      {metric.isSummary && <span className="topo-metric-badge">S</span>}
      <span style={{ fontSize: 9, color: '#4c566a', marginLeft: 4 }}>({metric.id})</span>
      <div className="topo-editor-card-actions">
        <IconButton name="trash-alt" size="sm" onClick={onDelete} tooltip="Remove metric" />
      </div>
    </div>
  );

  return (
    <CollapsableSection label={header} isOpen={isOpen} onToggle={onToggle}>
      <div className="topo-editor-field">
        <label>Ref ID <span style={{ fontSize: 9, color: '#4c566a' }}>(must match query refId)</span></label>
        <Input value={metric.id} onChange={(e) => handleField('id', e.currentTarget.value)} placeholder="cf-rps" />
      </div>
      <div className="topo-editor-field">
        <label>Label</label>
        <Input value={metric.label} onChange={(e) => handleField('label', e.currentTarget.value)} placeholder="cpu, rps..." />
      </div>
      <div className="topo-editor-field">
        <label>Format <span style={{ fontSize: 9, color: '#4c566a' }}>use {'${value}'} for interpolation</span></label>
        <Input value={metric.format} onChange={(e) => handleField('format', e.currentTarget.value)} placeholder="${value}%" />
      </div>
      <div className="topo-editor-field">
        <label>Section <span style={{ fontSize: 9, color: '#4c566a' }}>groups metrics in expanded view</span></label>
        <Select
          options={sectionOptions}
          value={metric.section}
          onChange={(v) => handleField('section', v.value!)}
          allowCustomValue
          placeholder="Select or type..."
        />
      </div>
      <div className="topo-editor-row">
        <Checkbox label="Summary (visible collapsed)" value={metric.isSummary} onChange={(e) => handleField('isSummary', e.currentTarget.checked)} />
        <Checkbox label="Sparkline" value={metric.showSparkline} onChange={(e) => handleField('showSparkline', e.currentTarget.checked)} />
      </div>

      <div className="topo-editor-section-title">Data binding</div>
      <div className="topo-editor-field">
        <label>Datasource</label>
        <DataSourcePicker
          current={metric.datasourceUid || null}
          onChange={(ds) => handleField('datasourceUid', ds.uid)}
          noDefault
        />
      </div>
      {metric.datasourceUid && (
        <div className="topo-editor-field">
          <label>Metric name <span style={{ fontSize: 9, color: '#4c566a' }}>({availableMetrics.length} available)</span></label>
          <Select
            options={availableMetrics}
            value={metric.query || null}
            onChange={(v) => handleField('query', v.value!)}
            allowCustomValue
            isLoading={loadingMetrics}
            placeholder={loadingMetrics ? 'Loading metrics...' : 'Select or type query...'}
            isClearable
          />
        </div>
      )}

      <div className="topo-editor-section-title">Thresholds</div>
      <ThresholdList thresholds={metric.thresholds} onChange={(t) => handleField('thresholds', t)} />
    </CollapsableSection>
  );
};
