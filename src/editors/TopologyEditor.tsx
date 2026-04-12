import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { TopologyPanelOptions, ThresholdStep } from '../types';

type Props = StandardEditorProps<unknown, object, TopologyPanelOptions>;

/**
 * TopologyEditor - Custom editor widget for topology configuration info.
 * Registered via addCustomEditor() in the Topology category.
 * Displays node/edge/group counts and setup instructions.
 * The "Load example" action lives in the TopologyPanel toolbar.
 */
export const TopologyEditor: React.FC<Props> = ({ context }) => {
  const options = context.options;
  const nodeCount = options?.nodes?.length || 0;
  const edgeCount = options?.edges?.length || 0;
  const groupCount = options?.groups?.length || 0;

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{
        background: '#1e2228',
        borderRadius: '6px',
        padding: '12px',
        marginBottom: '12px',
        fontSize: '13px',
        lineHeight: '1.6'
      }}>
        <div><strong>Nodes:</strong> {nodeCount}</div>
        <div><strong>Edges:</strong> {edgeCount}</div>
        <div><strong>Groups:</strong> {groupCount}</div>
      </div>

      <div style={{
        background: '#1e2228',
        borderRadius: '6px',
        padding: '12px',
        fontSize: '12px',
        color: '#88c0d0',
        lineHeight: '1.6'
      }}>
        <p style={{ marginBottom: '8px' }}>
          <strong>Setup:</strong> Configure topology via dashboard JSON editor
          or use the <em>Load example</em> button in the panel toolbar.
        </p>
        <p style={{ marginBottom: '8px' }}>
          1. Click the dashboard settings gear icon<br/>
          2. Select &quot;JSON Model&quot;<br/>
          3. Find this panel&apos;s <code>options</code> object<br/>
          4. Add <code>nodes</code>, <code>edges</code>, and <code>groups</code> arrays
        </p>
        <p style={{ color: '#616e88' }}>
          See project documentation for the full JSON schema and example configurations.
        </p>
      </div>
    </div>
  );
};

// ============================================================
// Example topology data — exported for use by TopologyPanel toolbar
// ============================================================

// Helper to type threshold colors as literal union
function t(value: number, color: 'green' | 'yellow' | 'red'): ThresholdStep {
  return { value, color };
}

export function getExampleTopology(): Partial<TopologyPanelOptions> {
  return {
    nodes: [
      {
        id: 'n-cdn', name: 'CDN Edge', role: 'CDN / WAF', type: 'cloudflare',
        position: { x: 245, y: 20 }, compact: false, width: 180,
        metrics: [
          { id: 'cf-rps', label: 'rps', datasourceUid: '', query: '', format: '${value}', section: 'Traffic', isSummary: true, thresholds: [{ value: 0, color: 'green' }, { value: 15000, color: 'yellow' }, { value: 25000, color: 'red' }], showSparkline: true },
          { id: 'cf-cache', label: 'cache', datasourceUid: '', query: '', format: '${value}%', section: 'Traffic', isSummary: true, thresholds: [{ value: 0, color: 'red' }, { value: 50, color: 'yellow' }, { value: 80, color: 'green' }], showSparkline: false },
          { id: 'cf-waf', label: 'waf', datasourceUid: '', query: '', format: '${value}', section: 'Security', isSummary: false, thresholds: [{ value: 0, color: 'green' }, { value: 100, color: 'yellow' }, { value: 500, color: 'red' }], showSparkline: false },
          { id: 'cf-p95', label: 'p95', datasourceUid: '', query: '', format: '${value}ms', section: 'Performance', isSummary: false, thresholds: [{ value: 0, color: 'green' }, { value: 100, color: 'yellow' }, { value: 500, color: 'red' }], showSparkline: true },
        ],
      },
      {
        id: 'n-fw1', name: 'Firewall 01', role: 'active', type: 'firewall',
        position: { x: 70, y: 175 }, compact: false, width: 200, groupId: 'grp-fw',
        metrics: [
          { id: 'pa1-sess', label: 'sessions', datasourceUid: '', query: '', format: '${value}', section: 'System', isSummary: true, thresholds: [{ value: 0, color: 'green' }], showSparkline: true },
          { id: 'pa1-cpu', label: 'cpu', datasourceUid: '', query: '', format: '${value}%', section: 'System', isSummary: true, thresholds: [{ value: 0, color: 'green' }, { value: 60, color: 'yellow' }, { value: 80, color: 'red' }], showSparkline: false },
          { id: 'pa1-tput', label: 'tput', datasourceUid: '', query: '', format: '${value}', section: 'System', isSummary: false, thresholds: [{ value: 0, color: 'green' }], showSparkline: true },
          { id: 'pa1-threats', label: 'threats', datasourceUid: '', query: '', format: '${value}', section: 'Security', isSummary: false, thresholds: [{ value: 0, color: 'green' }, { value: 1, color: 'yellow' }, { value: 10, color: 'red' }], showSparkline: false },
        ],
      },
      {
        id: 'n-fw2', name: 'Firewall 02', role: 'passive', type: 'firewall',
        position: { x: 400, y: 175 }, compact: false, width: 200, groupId: 'grp-fw',
        metrics: [
          { id: 'pa2-sess', label: 'sessions', datasourceUid: '', query: '', format: '${value}', section: 'System', isSummary: true, thresholds: [{ value: 0, color: 'green' }], showSparkline: false },
          { id: 'pa2-cpu', label: 'cpu', datasourceUid: '', query: '', format: '${value}%', section: 'System', isSummary: true, thresholds: [{ value: 0, color: 'green' }, { value: 60, color: 'yellow' }, { value: 80, color: 'red' }], showSparkline: false },
          { id: 'pa2-sync', label: 'sync', datasourceUid: '', query: '', format: '${value}', section: 'HA', isSummary: false, thresholds: [], showSparkline: false },
        ],
      },
      {
        id: 'n-lb1', name: 'Load Balancer 01', role: 'active', type: 'loadbalancer',
        position: { x: 70, y: 335 }, compact: false, width: 200, groupId: 'grp-lb',
        metrics: [
          { id: 'lb1-cpu', label: 'cpu', datasourceUid: '', query: '', format: '${value}%', section: 'System', isSummary: true, thresholds: [{ value: 0, color: 'green' }, { value: 60, color: 'yellow' }, { value: 80, color: 'red' }], showSparkline: true },
          { id: 'lb1-mem', label: 'mem', datasourceUid: '', query: '', format: '${value}%', section: 'System', isSummary: true, thresholds: [{ value: 0, color: 'green' }, { value: 60, color: 'yellow' }, { value: 80, color: 'red' }], showSparkline: false },
          { id: 'lb1-conns', label: 'conns', datasourceUid: '', query: '', format: '${value}', section: 'Connections', isSummary: false, thresholds: [{ value: 0, color: 'green' }], showSparkline: true },
          { id: 'lb1-ssl', label: 'ssl tps', datasourceUid: '', query: '', format: '${value}', section: 'Connections', isSummary: false, thresholds: [{ value: 0, color: 'green' }, { value: 800, color: 'yellow' }, { value: 1200, color: 'red' }], showSparkline: false },
        ],
      },
      {
        id: 'n-lb2', name: 'Load Balancer 02', role: 'standby', type: 'loadbalancer',
        position: { x: 400, y: 335 }, compact: false, width: 200, groupId: 'grp-lb',
        metrics: [
          { id: 'lb2-cpu', label: 'cpu', datasourceUid: '', query: '', format: '${value}%', section: 'System', isSummary: true, thresholds: [{ value: 0, color: 'green' }, { value: 60, color: 'yellow' }, { value: 80, color: 'red' }], showSparkline: false },
          { id: 'lb2-mem', label: 'mem', datasourceUid: '', query: '', format: '${value}%', section: 'System', isSummary: true, thresholds: [{ value: 0, color: 'green' }, { value: 60, color: 'yellow' }, { value: 80, color: 'red' }], showSparkline: false },
          { id: 'lb2-conns', label: 'conns', datasourceUid: '', query: '', format: '${value}', section: 'Connections', isSummary: false, thresholds: [{ value: 0, color: 'green' }], showSparkline: false },
          { id: 'lb2-sync', label: 'sync', datasourceUid: '', query: '', format: '${value}', section: 'HA', isSummary: false, thresholds: [], showSparkline: false },
        ],
      },
      {
        id: 'n-vs', name: 'VS Web 443', role: 'virtual server', type: 'virtualserver',
        position: { x: 175, y: 470 }, compact: false, width: 150,
        metrics: [
          { id: 'vs-conns', label: 'conns', datasourceUid: '', query: '', format: '${value}', section: 'Connections', isSummary: true, thresholds: [{ value: 0, color: 'green' }], showSparkline: false },
          { id: 'vs-status', label: 'status', datasourceUid: '', query: '', format: '${value}', section: 'Connections', isSummary: true, thresholds: [], showSparkline: false },
          { id: 'vs-in', label: 'in', datasourceUid: '', query: '', format: '${value}', section: 'Connections', isSummary: false, thresholds: [{ value: 0, color: 'green' }], showSparkline: true },
          { id: 'vs-out', label: 'out', datasourceUid: '', query: '', format: '${value}', section: 'Connections', isSummary: false, thresholds: [{ value: 0, color: 'green' }], showSparkline: true },
        ],
      },
      {
        id: 'n-pl', name: 'Web Pool', role: '6/6 up', type: 'pool',
        position: { x: 370, y: 470 }, compact: false, width: 150,
        metrics: [
          { id: 'pl-act', label: 'active', datasourceUid: '', query: '', format: '${value}', section: 'Pool', isSummary: true, thresholds: [{ value: 0, color: 'green' }], showSparkline: false },
          { id: 'pl-que', label: 'queued', datasourceUid: '', query: '', format: '${value}', section: 'Pool', isSummary: true, thresholds: [{ value: 0, color: 'green' }, { value: 1, color: 'yellow' }, { value: 10, color: 'red' }], showSparkline: false },
          { id: 'pl-algo', label: 'algo', datasourceUid: '', query: '', format: '${value}', section: 'Pool', isSummary: false, thresholds: [], showSparkline: false },
          { id: 'pl-health', label: 'health', datasourceUid: '', query: '', format: '${value}', section: 'Monitor', isSummary: false, thresholds: [], showSparkline: false },
        ],
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `n-s${i + 1}`, name: `Server 0${i + 1}`, role: '', type: 'server' as const,
        position: { x: 15 + i * 110, y: 570 }, compact: true, width: 100, groupId: 'grp-srv',
        metrics: [
          { id: `s${i + 1}-cpu`, label: 'cpu', datasourceUid: '', query: '', format: '${value}', section: 'System', isSummary: true, thresholds: [t(0, 'green'), t(60, 'yellow'), t(80, 'red')], showSparkline: false },
          { id: `s${i + 1}-ram`, label: 'ram', datasourceUid: '', query: '', format: '${value}', section: 'System', isSummary: true, thresholds: [t(0, 'green'), t(40, 'yellow'), t(70, 'red')], showSparkline: false },
          { id: `s${i + 1}-rps`, label: 'rps', datasourceUid: '', query: '', format: '${value}', section: 'System', isSummary: false, thresholds: [t(0, 'green')], showSparkline: true },
          { id: `s${i + 1}-5xx`, label: '5xx', datasourceUid: '', query: '', format: '${value}', section: 'System', isSummary: false, thresholds: [t(0, 'green'), t(1, 'yellow'), t(5, 'red')], showSparkline: false },
        ],
      })),
    ],
    edges: [
      { id: 'e-cdn-fw1', sourceId: 'n-cdn', targetId: 'n-fw1', type: 'traffic', thicknessMode: 'proportional', thicknessMin: 1.5, thicknessMax: 4, thresholds: [{ value: 0, color: 'green' }], flowAnimation: true, flowSpeed: 'auto', bidirectional: false, anchorSource: 'auto', anchorTarget: 'auto', labelTemplate: '18.2k rps' },
      { id: 'e-cdn-fw2', sourceId: 'n-cdn', targetId: 'n-fw2', type: 'traffic', thicknessMode: 'fixed', thicknessMin: 1.5, thicknessMax: 4, thresholds: [{ value: 0, color: 'green' }], flowAnimation: true, flowSpeed: 'slow', bidirectional: false, anchorSource: 'auto', anchorTarget: 'auto', labelTemplate: '6.1k rps' },
      { id: 'e-fw1-lb1', sourceId: 'n-fw1', targetId: 'n-lb1', type: 'traffic', thicknessMode: 'proportional', thicknessMin: 1.5, thicknessMax: 4, thresholds: [{ value: 0, color: 'green' }], flowAnimation: true, flowSpeed: 'fast', bidirectional: false, anchorSource: 'auto', anchorTarget: 'auto', labelTemplate: '34.6k sess' },
      { id: 'e-fw2-lb2', sourceId: 'n-fw2', targetId: 'n-lb2', type: 'traffic', thicknessMode: 'fixed', thicknessMin: 1.5, thicknessMax: 4, thresholds: [{ value: 0, color: 'green' }], flowAnimation: true, flowSpeed: 'slow', bidirectional: false, anchorSource: 'auto', anchorTarget: 'auto', labelTemplate: 'standby' },
      { id: 'e-lb1-vs', sourceId: 'n-lb1', targetId: 'n-vs', type: 'traffic', thicknessMode: 'fixed', thicknessMin: 1.5, thicknessMax: 4, thresholds: [{ value: 0, color: 'green' }], flowAnimation: true, flowSpeed: 'normal', bidirectional: false, anchorSource: 'auto', anchorTarget: 'auto' },
      { id: 'e-lb2-vs', sourceId: 'n-lb2', targetId: 'n-vs', type: 'traffic', thicknessMode: 'fixed', thicknessMin: 1.5, thicknessMax: 4, thresholds: [{ value: 0, color: 'green' }], flowAnimation: true, flowSpeed: 'slow', bidirectional: false, anchorSource: 'auto', anchorTarget: 'auto' },
      { id: 'e-vs-pl', sourceId: 'n-vs', targetId: 'n-pl', type: 'traffic', thicknessMode: 'fixed', thicknessMin: 1.5, thicknessMax: 4, thresholds: [{ value: 0, color: 'green' }], flowAnimation: true, flowSpeed: 'normal', bidirectional: false, anchorSource: 'auto', anchorTarget: 'auto', labelTemplate: '128' },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `e-pl-s${i + 1}`, sourceId: 'n-pl', targetId: `n-s${i + 1}`, type: 'traffic' as const,
        thicknessMode: 'fixed' as const, thicknessMin: 1.5, thicknessMax: 4,
        thresholds: [{ value: 0, color: 'green' as const }],
        flowAnimation: true, flowSpeed: 'auto' as const,
        bidirectional: false, anchorSource: 'auto' as const, anchorTarget: 'auto' as const,
      })),
    ],
    groups: [
      { id: 'grp-fw', label: 'HA — Firewalls', type: 'ha_pair', nodeIds: ['n-fw1', 'n-fw2'], style: 'dashed' },
      { id: 'grp-lb', label: 'HA — Load Balancers', type: 'ha_pair', nodeIds: ['n-lb1', 'n-lb2'], style: 'dashed' },
      { id: 'grp-srv', label: 'Web Server Cluster', type: 'cluster', nodeIds: ['n-s1', 'n-s2', 'n-s3', 'n-s4', 'n-s5', 'n-s6'], style: 'dashed' },
    ],
  };
}
