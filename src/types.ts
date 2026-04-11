import { DataQuery } from '@grafana/data';

// ============================================================
// NODE TYPES
// ============================================================

export type NodeType = 'cloudflare' | 'firewall' | 'loadbalancer' | 'virtualserver' | 'pool' | 'server' | 'database' | 'cache' | 'queue' | 'custom';
export type NodeStatus = 'ok' | 'warning' | 'critical' | 'unknown' | 'nodata';

export interface NodeMetricConfig {
  /** Unique metric id within this node */
  id: string;
  /** Display label (e.g. "cpu", "rps", "sessions") */
  label: string;
  /** Datasource uid */
  datasourceUid: string;
  /** Query expression */
  query: string;
  /** Format string for value display: "${value}%", "${value} rps" */
  format: string;
  /** Section this metric belongs to in expanded view */
  section: string;
  /** Whether this is a "summary" metric shown in collapsed view (max 4) */
  isSummary: boolean;
  /** Threshold breakpoints */
  thresholds: ThresholdStep[];
  /** Show sparkline in expanded view */
  showSparkline: boolean;
}

export interface ThresholdStep {
  value: number;
  color: 'green' | 'yellow' | 'red';
}

export interface TopologyNode {
  /** Unique node identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short role/description */
  role: string;
  /** Node type - determines icon and default color */
  type: NodeType;
  /** Metric configurations */
  metrics: NodeMetricConfig[];
  /** Position on canvas */
  position: { x: number; y: number };
  /** Fixed width (optional, auto-calculated if not set) */
  width?: number;
  /** Group this node belongs to (e.g. "ha-paloalto") */
  groupId?: string;
  /** Whether this node is compact (mini node like IIS servers) */
  compact: boolean;
}

// ============================================================
// GROUP TYPES
// ============================================================

export interface NodeGroup {
  /** Unique group id */
  id: string;
  /** Display label */
  label: string;
  /** Group type */
  type: 'ha_pair' | 'cluster' | 'pool' | 'custom';
  /** Node IDs in this group */
  nodeIds: string[];
  /** Visual style */
  style: 'dashed' | 'solid' | 'none';
}

// ============================================================
// EDGE / RELATIONSHIP TYPES
// ============================================================

export type EdgeType = 'traffic' | 'ha_sync' | 'failover' | 'monitor' | 'custom';
export type EdgeStatus = 'healthy' | 'saturated' | 'degraded' | 'down' | 'nodata';
export type ThicknessMode = 'fixed' | 'proportional' | 'threshold';
export type FlowSpeed = 'auto' | 'slow' | 'normal' | 'fast' | 'none';
export type AnchorPoint = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface EdgeMetricConfig {
  /** Datasource uid */
  datasourceUid: string;
  /** Query expression */
  query: string;
  /** Alias for this metric */
  alias: string;
}

export interface TopologyEdge {
  /** Unique edge id */
  id: string;
  /** Source node id */
  sourceId: string;
  /** Target node id — for static edges */
  targetId?: string;
  /** Target query — for dynamic edges (e.g. pool members) */
  targetQuery?: DynamicTargetQuery;
  /** Edge type */
  type: EdgeType;
  /** Metric that drives edge value/color/thickness */
  metric?: EdgeMetricConfig;
  /** Label template: "${value} rps" */
  labelTemplate?: string;
  /** How thickness maps to metric value */
  thicknessMode: ThicknessMode;
  /** Min thickness in px */
  thicknessMin: number;
  /** Max thickness in px */
  thicknessMax: number;
  /** Threshold breakpoints for edge color */
  thresholds: ThresholdStep[];
  /** Animate flow dashes */
  flowAnimation: boolean;
  /** Flow speed mode */
  flowSpeed: FlowSpeed;
  /** Bidirectional arrows */
  bidirectional: boolean;
  /** Source anchor point */
  anchorSource: AnchorPoint;
  /** Target anchor point */
  anchorTarget: AnchorPoint;
  /** State mapping for non-numeric metrics (e.g. HA sync) */
  stateMap?: Record<string, string>;
}

/** For edges where targets are discovered from a metric query */
export interface DynamicTargetQuery {
  /** Datasource uid */
  datasourceUid: string;
  /** Query that returns a list of targets */
  query: string;
  /** Label from query results that maps to a node ID */
  nodeIdLabel: string;
  /** Template for auto-creating nodes from query results */
  nodeTemplate?: {
    type: NodeType;
    nameTemplate: string;
    compact: boolean;
  };
}

// ============================================================
// RUNTIME STATE (computed, not persisted)
// ============================================================

export interface NodeRuntimeState {
  nodeId: string;
  status: NodeStatus;
  metricValues: Record<string, MetricValue>;
  expanded: boolean;
}

export interface EdgeRuntimeState {
  edgeId: string;
  status: EdgeStatus;
  value?: number;
  formattedLabel?: string;
  thickness: number;
  color: string;
  animationSpeed: number;
}

export interface MetricValue {
  raw: number | null;
  formatted: string;
  status: NodeStatus;
  sparklineData?: number[];
}

// ============================================================
// PANEL OPTIONS
// ============================================================

export interface TopologyPanelOptions {
  /** All node definitions */
  nodes: TopologyNode[];
  /** All edge/relationship definitions */
  edges: TopologyEdge[];
  /** Node groups (HA pairs, clusters, etc.) */
  groups: NodeGroup[];
  /** Canvas settings */
  canvas: {
    showGrid: boolean;
    gridSize: number;
    snapToGrid: boolean;
    backgroundColor: string;
  };
  /** Global animation settings */
  animation: {
    flowEnabled: boolean;
    defaultFlowSpeed: FlowSpeed;
    pulseOnCritical: boolean;
  };
  /** Layout settings */
  layout: {
    autoLayout: boolean;
    direction: 'top-down' | 'left-right';
    tierSpacing: number;
    nodeSpacing: number;
  };
  /** Display settings */
  display: {
    showEdgeLabels: boolean;
    showNodeStatus: boolean;
    compactMode: boolean;
    maxSummaryMetrics: number;
  };
}

// ============================================================
// DEFAULTS
// ============================================================

export const DEFAULT_NODE: Partial<TopologyNode> = {
  type: 'custom',
  role: '',
  metrics: [],
  position: { x: 100, y: 100 },
  compact: false,
};

export const DEFAULT_EDGE: Partial<TopologyEdge> = {
  type: 'traffic',
  thicknessMode: 'fixed',
  thicknessMin: 1.5,
  thicknessMax: 4,
  thresholds: [
    { value: 0, color: 'green' },
    { value: 70, color: 'yellow' },
    { value: 90, color: 'red' },
  ],
  flowAnimation: true,
  flowSpeed: 'auto',
  bidirectional: false,
  anchorSource: 'auto',
  anchorTarget: 'auto',
};

export const DEFAULT_PANEL_OPTIONS: TopologyPanelOptions = {
  nodes: [],
  edges: [],
  groups: [],
  canvas: {
    showGrid: true,
    gridSize: 20,
    snapToGrid: true,
    backgroundColor: 'transparent',
  },
  animation: {
    flowEnabled: true,
    defaultFlowSpeed: 'auto',
    pulseOnCritical: true,
  },
  layout: {
    autoLayout: true,
    direction: 'top-down',
    tierSpacing: 120,
    nodeSpacing: 20,
  },
  display: {
    showEdgeLabels: true,
    showNodeStatus: true,
    compactMode: false,
    maxSummaryMetrics: 4,
  },
};

// ============================================================
// NODE TYPE CONFIG (icon, default color per type)
// ============================================================

export const NODE_TYPE_CONFIG: Record<NodeType, { icon: string; color: string; defaultRole: string }> = {
  cloudflare: { icon: 'CF', color: '#ebcb8b', defaultRole: 'CDN / WAF' },
  firewall: { icon: 'PA', color: '#bf616a', defaultRole: 'Firewall' },
  loadbalancer: { icon: 'F5', color: '#d08770', defaultRole: 'Load Balancer' },
  virtualserver: { icon: 'VS', color: '#b48ead', defaultRole: 'Virtual Server' },
  pool: { icon: 'PL', color: '#a3be8c', defaultRole: 'Pool' },
  server: { icon: 'IIS', color: '#88c0d0', defaultRole: 'Server' },
  database: { icon: 'DB', color: '#5e81ac', defaultRole: 'Database' },
  cache: { icon: 'RD', color: '#bf616a', defaultRole: 'Cache' },
  queue: { icon: 'MQ', color: '#ebcb8b', defaultRole: 'Message Queue' },
  custom: { icon: '?', color: '#4c566a', defaultRole: '' },
};

export const STATUS_COLORS: Record<NodeStatus | EdgeStatus, string> = {
  ok: '#a3be8c',
  healthy: '#a3be8c',
  warning: '#ebcb8b',
  saturated: '#ebcb8b',
  critical: '#bf616a',
  degraded: '#bf616a',
  down: '#bf616a',
  unknown: '#4c566a',
  nodata: '#4c566a',
};
