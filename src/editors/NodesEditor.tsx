import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button, Select, Checkbox, Input, CollapsableSection } from '@grafana/ui';
import { DataSourcePicker, getDataSourceSrv } from '@grafana/runtime';
import { TopologyPanelOptions, TopologyNode, NodeMetricConfig } from '../types';
import { NodeCard } from './components/NodeCard';
import { generateId, sanitizeLabel } from './utils/editorUtils';
import './editors.css';

type Props = StandardEditorProps<TopologyNode[], object, TopologyPanelOptions>;

// ─── Bulk Import: discover hosts and create nodes in batch ───
const BulkImport: React.FC<{ existingNodes: TopologyNode[]; onImport: (nodes: TopologyNode[]) => void }> = ({
  existingNodes,
  onImport,
}) => {
  const [dsUid, setDsUid] = useState('');
  const [jobs, setJobs] = useState<Array<{ label: string; value: string; count: number }>>([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [hosts, setHosts] = useState<Array<{ instance: string; up: boolean }>>([]);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());
  const [metrics, setMetrics] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [metricFilter, setMetricFilter] = useState('');
  const [loading, setLoading] = useState('');

  const existingNames = useMemo(() => new Set(existingNodes.map((n) => n.name)), [existingNodes]);

  // Fetch jobs when datasource changes
  useEffect(() => {
    if (!dsUid) { setJobs([]); return; }
    let cancelled = false;
    setLoading('jobs');
    (async () => {
      try {
        const ds = await getDataSourceSrv().get(dsUid);
        if (cancelled || ds.type !== 'prometheus') { setLoading(''); return; }
        const resp = await fetch(`/api/datasources/proxy/uid/${dsUid}/api/v1/query?query=${encodeURIComponent('count by(job)(up)')}`);
        if (cancelled) { return; }
        const data = await resp.json();
        const list = (data?.data?.result || [])
          .map((r: { metric: { job: string }; value: [number, string] }) => ({
            label: `${r.metric.job} (${r.value[1]} targets)`,
            value: r.metric.job,
            count: parseInt(r.value[1], 10),
          }))
          .sort((a: { value: string }, b: { value: string }) => a.value.localeCompare(b.value));
        setJobs(list);
      } catch { /* ignore */ }
      finally { if (!cancelled) { setLoading(''); } }
    })();
    return () => { cancelled = true; };
  }, [dsUid]);

  // Fetch hosts when job changes
  useEffect(() => {
    if (!dsUid || !selectedJob) { setHosts([]); setSelectedHosts(new Set()); return; }
    let cancelled = false;
    setLoading('hosts');
    (async () => {
      try {
        const resp = await fetch(
          `/api/datasources/proxy/uid/${dsUid}/api/v1/query?query=${encodeURIComponent(`up{job="${sanitizeLabel(selectedJob)}"}`)}`
        );
        if (cancelled) { return; }
        const data = await resp.json();
        const list = (data?.data?.result || [])
          .map((r: { metric: { instance: string }; value: [number, string] }) => ({
            instance: r.metric.instance,
            up: r.value[1] === '1',
          }))
          .filter((h: { instance: string }) => h.instance)
          .sort((a: { instance: string }, b: { instance: string }) => a.instance.localeCompare(b.instance));
        setHosts(list);
      } catch { /* ignore */ }
      finally { if (!cancelled) { setLoading(''); } }
    })();
    return () => { cancelled = true; };
  }, [dsUid, selectedJob]);

  // Fetch available metrics when hosts are selected (use first selected host as sample)
  useEffect(() => {
    if (!dsUid || selectedHosts.size === 0) { setMetrics([]); return; }
    const sampleHost = [...selectedHosts][0];
    let cancelled = false;
    setLoading('metrics');
    (async () => {
      try {
        const resp = await fetch(
          `/api/datasources/proxy/uid/${dsUid}/api/v1/series?` +
          new URLSearchParams({
            'match[]': `{job="${sanitizeLabel(selectedJob)}", instance="${sanitizeLabel(sampleHost)}"}`,
            start: String(Math.floor(Date.now() / 1000) - 300),
            end: String(Math.floor(Date.now() / 1000)),
          })
        );
        if (cancelled) { return; }
        const data = await resp.json();
        const names = [...new Set((data?.data || []).map((s: Record<string, string>) => s.__name__))]
          .filter(Boolean).sort() as string[];
        setMetrics(names);
        // Auto-select first 4 "interesting" metrics
        const interesting = names.filter((n) =>
          /cpu|memory|mem_free|request|connection|session|bandwidth/.test(n)
        ).slice(0, 4);
        setSelectedMetrics(new Set(interesting));
      } catch { /* ignore */ }
      finally { if (!cancelled) { setLoading(''); } }
    })();
    return () => { cancelled = true; };
  }, [dsUid, selectedJob, selectedHosts]);

  const toggleHost = useCallback((instance: string) => {
    setSelectedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(instance)) { next.delete(instance); } else { next.add(instance); }
      return next;
    });
  }, []);

  const selectAllHosts = useCallback(() => {
    setSelectedHosts(new Set(hosts.map((h) => h.instance)));
  }, [hosts]);

  const toggleMetric = useCallback((name: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });
  }, []);

  const filteredMetrics = useMemo(() => {
    if (!metricFilter) { return metrics; }
    const lower = metricFilter.toLowerCase();
    return metrics.filter((m) => m.toLowerCase().includes(lower));
  }, [metrics, metricFilter]);

  const handleImport = useCallback(() => {
    const metricNames = [...selectedMetrics];
    const newNodes: TopologyNode[] = [...selectedHosts].map((instance, idx) => {
      const nodeMetrics: NodeMetricConfig[] = metricNames.map((name, mIdx) => ({
        id: `${instance.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${name.replace(/^(windows_|cloudflare_|node_|kube_|container_)/, '').substring(0, 15)}`,
        label: name.replace(/^(windows_|cloudflare_|node_|kube_|container_)/, '').replace(/_total$/, '').substring(0, 20),
        datasourceUid: dsUid,
        query: name,
        format: '${value}',
        section: 'General',
        isSummary: mIdx < 4,
        thresholds: [{ value: 0, color: 'green' as const }],
        showSparkline: false,
      }));
      return {
        id: generateId('n'),
        name: instance,
        role: selectedJob,
        type: 'server' as const,
        metrics: nodeMetrics,
        position: { x: 50 + (idx % 6) * 120, y: 50 + Math.floor(idx / 6) * 150 },
        compact: selectedHosts.size > 4,
        width: selectedHosts.size > 4 ? 110 : 180,
      };
    });
    onImport(newNodes);
    // Reset
    setSelectedHosts(new Set());
    setSelectedMetrics(new Set());
  }, [selectedHosts, selectedMetrics, dsUid, selectedJob, onImport]);

  return (
    <CollapsableSection label="Bulk Import — discover & add multiple nodes" isOpen={false}>
      {/* Step 1: Datasource */}
      <div className="topo-editor-field">
        <label>Datasource</label>
        <DataSourcePicker
          current={dsUid || null}
          onChange={(ds) => { setDsUid(ds.uid); setSelectedJob(''); }}
          noDefault
        />
      </div>

      {/* Step 2: Job */}
      {dsUid && (
        <div className="topo-editor-field">
          <label>Job / Service {loading === 'jobs' ? '(loading...)' : `(${jobs.length})`}</label>
          <Select
            options={jobs}
            value={selectedJob || null}
            onChange={(v) => setSelectedJob(v.value!)}
            placeholder="Select job..."
            isLoading={loading === 'jobs'}
          />
        </div>
      )}

      {/* Step 3: Select hosts */}
      {selectedJob && hosts.length > 0 && (
        <>
          <div className="topo-editor-row" style={{ justifyContent: 'space-between' }}>
            <label>Hosts ({selectedHosts.size}/{hosts.length} selected)</label>
            <Button size="sm" variant="secondary" fill="text" onClick={selectAllHosts}>Select all</Button>
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #2d3748', borderRadius: 4, padding: 4 }}>
            {hosts.map((h) => (
              <div
                key={h.instance}
                className="topo-editor-row"
                style={{ padding: '1px 2px', cursor: 'pointer', opacity: existingNames.has(h.instance) ? 0.4 : 1 }}
                onClick={() => !existingNames.has(h.instance) && toggleHost(h.instance)}
              >
                <Checkbox
                  value={selectedHosts.has(h.instance)}
                  onChange={() => toggleHost(h.instance)}
                  disabled={existingNames.has(h.instance)}
                />
                <span style={{ fontSize: 10, color: h.up ? '#a3be8c' : '#bf616a' }}>
                  {h.instance} {!h.up && '(down)'} {existingNames.has(h.instance) && '(exists)'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Step 4: Select metrics (from first selected host) */}
      {selectedHosts.size > 0 && metrics.length > 0 && (
        <>
          <div className="topo-editor-field" style={{ marginTop: 6 }}>
            <label>
              Metrics ({selectedMetrics.size} selected, first 4 = summary)
            </label>
            <Input
              value={metricFilter}
              onChange={(e) => setMetricFilter(e.currentTarget.value)}
              placeholder="Filter metrics... (cpu, mem, request...)"
              prefix={<span style={{ fontSize: 10 }}>🔍</span>}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #2d3748', borderRadius: 4, padding: 4 }}>
            {filteredMetrics.map((name) => (
              <div
                key={name}
                className="topo-editor-row"
                style={{ padding: '1px 2px', cursor: 'pointer' }}
                onClick={() => toggleMetric(name)}
              >
                <Checkbox value={selectedMetrics.has(name)} onChange={() => toggleMetric(name)} />
                <span style={{ fontSize: 10, color: selectedMetrics.has(name) ? '#88c0d0' : '#616e88' }}>
                  {name}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Import button */}
      {selectedHosts.size > 0 && selectedMetrics.size > 0 && (
        <Button
          size="md"
          variant="primary"
          onClick={handleImport}
          style={{ marginTop: 8, width: '100%' }}
          icon="import"
        >
          Import {selectedHosts.size} nodes with {selectedMetrics.size} metrics each
        </Button>
      )}
      {loading === 'hosts' && <div className="topo-editor-empty">Discovering hosts...</div>}
      {loading === 'metrics' && <div className="topo-editor-empty">Discovering metrics...</div>}
    </CollapsableSection>
  );
};

// ─── Import/Export helpers (pure, no React) ───
function exportTopologyJSON(options: TopologyPanelOptions): void {
  const payload = { nodes: options.nodes || [], edges: options.edges || [], groups: options.groups || [] };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'topology-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importTopologyJSON(file: File, currentNodes: TopologyNode[], onChange: (nodes: TopologyNode[]) => void): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string);
      if (Array.isArray(data.nodes)) {
        onChange([...currentNodes, ...data.nodes]);
      }
    } catch {
      // Silently fail on invalid JSON
    }
  };
  reader.readAsText(file);
}

// ─── Main NodesEditor ───
export const NodesEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const nodes = value || [];
  const edges = context.options?.edges || [];
  const groups = context.options?.groups || [];
  const selectedNodeId = (context.options as TopologyPanelOptions)?._selectedNodeId;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas-sidebar sync: auto-expand node clicked on canvas
  useEffect(() => {
    if (selectedNodeId && !expandedIds.has(selectedNodeId)) {
      setExpandedIds((prev) => new Set(prev).add(selectedNodeId));
    }
  }, [selectedNodeId, expandedIds]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    const newNode: TopologyNode = {
      id: generateId('n'),
      name: 'New node',
      role: '',
      type: 'custom',
      metrics: [],
      position: { x: 100, y: 100 },
      compact: false,
    };
    onChange([...nodes, newNode]);
    setExpandedIds((prev) => new Set(prev).add(newNode.id));
  }, [nodes, onChange]);

  const handleBulkImport = useCallback(
    (newNodes: TopologyNode[]) => {
      onChange([...nodes, ...newNodes]);
    },
    [nodes, onChange]
  );

  const handleChange = useCallback(
    (updated: TopologyNode) => {
      onChange(nodes.map((n) => (n.id === updated.id ? updated : n)));
    },
    [nodes, onChange]
  );

  // Delete with confirmation: count orphan edges first
  const handleDeleteRequest = useCallback((id: string) => {
    const orphanCount = edges.filter((e) => e.sourceId === id || e.targetId === id).length;
    if (orphanCount > 0) {
      setPendingDeleteId(id);
    } else {
      onChange(nodes.filter((n) => n.id !== id));
    }
  }, [nodes, edges, onChange]);

  const handleDeleteConfirm = useCallback(() => {
    if (pendingDeleteId) {
      onChange(nodes.filter((n) => n.id !== pendingDeleteId));
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, nodes, onChange]);

  const handleDuplicate = useCallback(
    (node: TopologyNode) => {
      const dup: TopologyNode = {
        ...node,
        id: generateId('n'),
        name: node.name + ' (copy)',
        position: { x: node.position.x + 30, y: node.position.y + 30 },
        metrics: node.metrics.map((m) => ({ ...m, id: generateId('m') })),
      };
      onChange([...nodes, dup]);
      setExpandedIds((prev) => new Set(prev).add(dup.id));
    },
    [nodes, onChange]
  );

  // Filter nodes by search text
  const filteredNodes = useMemo(() => {
    if (!filterText) { return nodes; }
    const lower = filterText.toLowerCase();
    return nodes.filter((n) =>
      n.name.toLowerCase().includes(lower) ||
      n.role.toLowerCase().includes(lower) ||
      n.type.toLowerCase().includes(lower)
    );
  }, [nodes, filterText]);

  // Orphan edge count for pending delete
  const pendingDeleteOrphanCount = useMemo(() => {
    if (!pendingDeleteId) { return 0; }
    return edges.filter((e) => e.sourceId === pendingDeleteId || e.targetId === pendingDeleteId).length;
  }, [pendingDeleteId, edges]);

  const pendingDeleteName = useMemo(() => {
    if (!pendingDeleteId) { return ''; }
    return nodes.find((n) => n.id === pendingDeleteId)?.name || pendingDeleteId;
  }, [pendingDeleteId, nodes]);

  return (
    <div>
      {/* Bulk Import */}
      <BulkImport existingNodes={nodes} onImport={handleBulkImport} />

      {/* Header with actions */}
      <div className="topo-editor-header">
        <span className="topo-editor-header-title">
          Nodes<span className="topo-editor-count">({nodes.length})</span>
        </span>
        <Button size="sm" variant="secondary" icon="import" onClick={() => fileInputRef.current?.click()} tooltip="Import topology JSON">
          Import
        </Button>
        <Button size="sm" variant="secondary" icon="download-alt" onClick={() => exportTopologyJSON(context.options as TopologyPanelOptions)} tooltip="Export topology JSON">
          Export
        </Button>
        <Button size="sm" variant="secondary" icon="plus" onClick={handleAdd}>
          Add
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { importTopologyJSON(file, nodes, onChange); }
            e.target.value = '';
          }}
        />
      </div>

      {/* Search filter */}
      {nodes.length > 3 && (
        <div className="topo-editor-field">
          <Input
            value={filterText}
            onChange={(e) => setFilterText(e.currentTarget.value)}
            placeholder="Filter nodes by name, role, type..."
            prefix={<span style={{ fontSize: 10, color: '#616e88' }}>Search</span>}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      {pendingDeleteId && (
        <div style={{ background: '#2d1b1b', border: '1px solid #bf616a', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#e5e9f0', marginBottom: 6 }}>
            Delete <strong>{pendingDeleteName}</strong>?
          </div>
          <div style={{ fontSize: 10, color: '#bf616a', marginBottom: 8 }}>
            {pendingDeleteOrphanCount} edge(s) reference this node and will become orphaned.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button size="sm" variant="destructive" onClick={handleDeleteConfirm}>Delete anyway</Button>
            <Button size="sm" variant="secondary" onClick={() => setPendingDeleteId(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Node list */}
      {nodes.length === 0 && (
        <div className="topo-editor-empty">No nodes defined. Use Bulk Import above or Add single nodes.</div>
      )}
      {filterText && filteredNodes.length === 0 && (
        <div className="topo-editor-empty">No nodes match &quot;{filterText}&quot;</div>
      )}
      {filteredNodes.map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          groups={groups}
          isOpen={expandedIds.has(node.id)}
          onToggle={() => toggleExpand(node.id)}
          onChange={handleChange}
          onDelete={() => handleDeleteRequest(node.id)}
          onDuplicate={() => handleDuplicate(node)}
        />
      ))}
    </div>
  );
};
