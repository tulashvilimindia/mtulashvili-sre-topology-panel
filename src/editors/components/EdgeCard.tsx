import React, { useCallback, useState, useMemo } from 'react';
import { CollapsableSection, Input, Select, Checkbox, IconButton, RadioButtonGroup, TextArea } from '@grafana/ui';
import { DataSourcePicker } from '@grafana/runtime';
import { TopologyEdge, TopologyNode } from '../../types';
import { ThresholdList } from './ThresholdList';
import { getNodeSelectOptions } from '../utils/editorUtils';
import '../editors.css';

const EDGE_TYPES = [
  { label: 'Traffic', value: 'traffic' as const },
  { label: 'HA sync', value: 'ha_sync' as const },
  { label: 'Failover', value: 'failover' as const },
  { label: 'Monitor', value: 'monitor' as const },
  { label: 'Custom', value: 'custom' as const },
];

const THICKNESS_MODES = [
  { label: 'Fixed', value: 'fixed' as const },
  { label: 'Proportional', value: 'proportional' as const },
  { label: 'Threshold', value: 'threshold' as const },
];

const FLOW_SPEEDS = [
  { label: 'Auto', value: 'auto' as const, description: 'Faster animation with higher metric values' },
  { label: 'Slow', value: 'slow' as const },
  { label: 'Normal', value: 'normal' as const },
  { label: 'Fast', value: 'fast' as const },
  { label: 'None', value: 'none' as const },
];

const ANCHORS = [
  { label: 'Auto', value: 'auto' as const },
  { label: 'Top', value: 'top' as const },
  { label: 'Bottom', value: 'bottom' as const },
  { label: 'Left', value: 'left' as const },
  { label: 'Right', value: 'right' as const },
];

interface Props {
  edge: TopologyEdge;
  nodes: TopologyNode[];
  isOpen: boolean;
  onToggle: () => void;
  onChange: (updated: TopologyEdge) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}

export const EdgeCard: React.FC<Props> = ({ edge, nodes, isOpen, onToggle, onChange, onDelete, onDuplicate }) => {
  const [showMetric, setShowMetric] = useState(false);
  const [showVisual, setShowVisual] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);

  const nodeOptions = useMemo(() => getNodeSelectOptions(nodes), [nodes]);

  const sourceName = useMemo(() => nodes.find((n) => n.id === edge.sourceId)?.name || edge.sourceId, [nodes, edge.sourceId]);
  const targetName = useMemo(
    () => nodes.find((n) => n.id === edge.targetId)?.name || edge.targetId || '?',
    [nodes, edge.targetId]
  );

  const handleField = useCallback(
    <K extends keyof TopologyEdge>(field: K, value: TopologyEdge[K]) => {
      onChange({ ...edge, [field]: value });
    },
    [edge, onChange]
  );

  const handleMetricField = useCallback(
    (field: keyof NonNullable<TopologyEdge['metric']>, value: string) => {
      onChange({
        ...edge,
        metric: { ...(edge.metric || { datasourceUid: '', query: '', alias: '' }), [field]: value },
      });
    },
    [edge, onChange]
  );

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      <span>{sourceName} → {targetName}</span>
      <span className="topo-editor-card-badge">{edge.type}</span>
      <div className="topo-editor-card-actions">
        {onDuplicate && <IconButton name="copy" size="sm" onClick={onDuplicate} tooltip="Duplicate edge" />}
        <IconButton name="trash-alt" size="sm" onClick={onDelete} tooltip="Delete edge" />
      </div>
    </div>
  );

  return (
    <div className="topo-editor-card">
      <CollapsableSection label={header} isOpen={isOpen} onToggle={onToggle}>
        <div className="topo-editor-field">
          <label>Source</label>
          <Select
            options={nodeOptions}
            value={edge.sourceId}
            onChange={(v) => handleField('sourceId', v.value!)}
            placeholder="Select source node..."
          />
        </div>
        <div className="topo-editor-field">
          <label>Target</label>
          <Select
            options={nodeOptions}
            value={edge.targetId || ''}
            onChange={(v) => handleField('targetId', v.value!)}
            placeholder="Select target node..."
          />
        </div>
        <div className="topo-editor-field">
          <label>Type</label>
          <RadioButtonGroup options={EDGE_TYPES} value={edge.type} onChange={(v) => handleField('type', v)} size="sm" />
        </div>
        <div className="topo-editor-field">
          <label>Label template <span style={{ fontSize: 9, color: '#4c566a' }}>{'use ${value} for metric interpolation'}</span></label>
          <Input
            value={edge.labelTemplate || ''}
            onChange={(e) => handleField('labelTemplate', e.currentTarget.value || undefined)}
            placeholder="${value} rps"
          />
        </div>
        <div className="topo-editor-row">
          <Checkbox
            label="Bidirectional"
            value={edge.bidirectional}
            onChange={(e) => handleField('bidirectional', e.currentTarget.checked)}
          />
        </div>
        <div className="topo-editor-field">
          <label>Notes</label>
          <TextArea
            value={edge.description || ''}
            onChange={(e) => handleField('description', e.currentTarget.value || undefined)}
            placeholder="Annotations..."
            rows={2}
          />
        </div>

        {/* Metric — with datasource picker */}
        <CollapsableSection label="Metric" isOpen={showMetric} onToggle={() => setShowMetric(!showMetric)}>
          <div className="topo-editor-field">
            <label>Datasource</label>
            <DataSourcePicker
              current={edge.metric?.datasourceUid || null}
              onChange={(ds) => handleMetricField('datasourceUid', ds.uid)}
              noDefault
            />
          </div>
          <div className="topo-editor-field">
            <label>Query</label>
            <Input
              value={edge.metric?.query || ''}
              onChange={(e) => handleMetricField('query', e.currentTarget.value)}
              placeholder="sum(rate(...))"
            />
          </div>
          <div className="topo-editor-field">
            <label>Alias</label>
            <Input
              value={edge.metric?.alias || ''}
              onChange={(e) => handleMetricField('alias', e.currentTarget.value)}
              placeholder="traffic"
            />
          </div>
        </CollapsableSection>

        {/* Thresholds */}
        <CollapsableSection
          label={`Thresholds (${edge.thresholds.length})`}
          isOpen={showThresholds}
          onToggle={() => setShowThresholds(!showThresholds)}
        >
          <ThresholdList thresholds={edge.thresholds} onChange={(t) => handleField('thresholds', t)} />
        </CollapsableSection>

        {/* Visual config */}
        <CollapsableSection label="Visual" isOpen={showVisual} onToggle={() => setShowVisual(!showVisual)}>
          <div className="topo-editor-field">
            <label>Thickness mode</label>
            <RadioButtonGroup options={THICKNESS_MODES} value={edge.thicknessMode} onChange={(v) => handleField('thicknessMode', v)} size="sm" />
          </div>
          <div className="topo-editor-row">
            <div className="topo-editor-field" style={{ flex: 1 }}>
              <label>Min (px)</label>
              <Input
                type="number"
                value={edge.thicknessMin}
                onChange={(e) => handleField('thicknessMin', parseFloat(e.currentTarget.value) || 1)}
                width={8}
              />
            </div>
            <div className="topo-editor-field" style={{ flex: 1 }}>
              <label>Max (px)</label>
              <Input
                type="number"
                value={edge.thicknessMax}
                onChange={(e) => handleField('thicknessMax', parseFloat(e.currentTarget.value) || 4)}
                width={8}
              />
            </div>
          </div>
          <div className="topo-editor-row">
            <Checkbox
              label="Flow animation"
              value={edge.flowAnimation}
              onChange={(e) => handleField('flowAnimation', e.currentTarget.checked)}
            />
          </div>
          <div className="topo-editor-field">
            <label>Speed</label>
            <Select options={FLOW_SPEEDS} value={edge.flowSpeed} onChange={(v) => handleField('flowSpeed', v.value!)} />
          </div>
          <div className="topo-editor-row">
            <div className="topo-editor-field" style={{ flex: 1 }}>
              <label>Anchor src</label>
              <Select options={ANCHORS} value={edge.anchorSource} onChange={(v) => handleField('anchorSource', v.value!)} />
            </div>
            <div className="topo-editor-field" style={{ flex: 1 }}>
              <label>Anchor tgt</label>
              <Select options={ANCHORS} value={edge.anchorTarget} onChange={(v) => handleField('anchorTarget', v.value!)} />
            </div>
          </div>
        </CollapsableSection>
      </CollapsableSection>
    </div>
  );
};
