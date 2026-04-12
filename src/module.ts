import { PanelPlugin } from '@grafana/data';
import { TopologyPanel } from './components/TopologyPanel';
import { NodesEditor } from './editors/NodesEditor';
import { EdgesEditor } from './editors/EdgesEditor';
import { GroupsEditor } from './editors/GroupsEditor';
import { TopologyPanelOptions, DEFAULT_PANEL_OPTIONS } from './types';

export const plugin = new PanelPlugin<TopologyPanelOptions>(TopologyPanel)
  .setPanelOptions((builder) => {
    builder
      .addBooleanSwitch({
        path: 'canvas.showGrid',
        name: 'Show grid',
        description: 'Show dot grid background for positioning reference',
        defaultValue: DEFAULT_PANEL_OPTIONS.canvas.showGrid,
      })
      .addBooleanSwitch({
        path: 'canvas.snapToGrid',
        name: 'Snap to grid',
        description: 'Snap nodes to grid when dragging',
        defaultValue: DEFAULT_PANEL_OPTIONS.canvas.snapToGrid,
      })
      .addNumberInput({
        path: 'canvas.gridSize',
        name: 'Grid size',
        description: 'Grid spacing in pixels',
        defaultValue: DEFAULT_PANEL_OPTIONS.canvas.gridSize,
      })
      .addBooleanSwitch({
        path: 'animation.flowEnabled',
        name: 'Flow animation',
        description: 'Animate flow on traffic edges',
        defaultValue: DEFAULT_PANEL_OPTIONS.animation.flowEnabled,
      })
      .addBooleanSwitch({
        path: 'animation.pulseOnCritical',
        name: 'Pulse on critical',
        description: 'Pulse status dot when node is critical',
        defaultValue: DEFAULT_PANEL_OPTIONS.animation.pulseOnCritical,
      })
      .addSelect({
        path: 'layout.direction',
        name: 'Layout direction',
        description: 'Auto-layout flow direction',
        defaultValue: DEFAULT_PANEL_OPTIONS.layout.direction,
        settings: {
          options: [
            { label: 'Top to bottom', value: 'top-down' },
            { label: 'Left to right', value: 'left-right' },
          ],
        },
      })
      .addNumberInput({
        path: 'layout.tierSpacing',
        name: 'Tier spacing',
        description: 'Vertical space between tiers in auto-layout',
        defaultValue: DEFAULT_PANEL_OPTIONS.layout.tierSpacing,
      })
      .addNumberInput({
        path: 'layout.nodeSpacing',
        name: 'Node spacing',
        description: 'Horizontal space between nodes in same tier',
        defaultValue: DEFAULT_PANEL_OPTIONS.layout.nodeSpacing,
      })
      .addBooleanSwitch({
        path: 'display.showEdgeLabels',
        name: 'Show edge labels',
        description: 'Display metric values on edges',
        defaultValue: DEFAULT_PANEL_OPTIONS.display.showEdgeLabels,
      })
      .addBooleanSwitch({
        path: 'display.showNodeStatus',
        name: 'Show status dots',
        description: 'Show colored status indicator dots on nodes',
        defaultValue: DEFAULT_PANEL_OPTIONS.display.showNodeStatus,
      })
      .addNumberInput({
        path: 'display.maxSummaryMetrics',
        name: 'Max summary metrics',
        description: 'Number of metrics shown in collapsed node view (1-6)',
        defaultValue: DEFAULT_PANEL_OPTIONS.display.maxSummaryMetrics,
      })
      .addCustomEditor({
        id: 'topology-nodes',
        path: 'nodes',
        name: 'Nodes',
        editor: NodesEditor,
        category: ['Topology'],
      })
      .addCustomEditor({
        id: 'topology-edges',
        path: 'edges',
        name: 'Relationships',
        editor: EdgesEditor,
        category: ['Topology'],
      })
      .addCustomEditor({
        id: 'topology-groups',
        path: 'groups',
        name: 'Groups',
        editor: GroupsEditor,
        category: ['Topology'],
      });
  });
