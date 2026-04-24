# Changelog

## 1.0.0 - 2026-04-24

Initial release of the E2E Topology panel plugin for Grafana 12+.

### Visualization
- Interactive SVG topology canvas with bezier edges and animated flow connections
- Neon drop-shadow glow on flow overlays that pulses in the edge's status color
- Draggable nodes with snap-to-grid; positions persist with the dashboard JSON
- HA pair, cluster, and pool group containers with dashed / dotted visual brackets
- Auto-layout via topological sort (top-down or left-right), O(V+E) with diamond fan-in handling
- Pan/zoom: mouse wheel zoom, Ctrl+drag pan, 1:1 reset, Fit-to-view
- Viewport persists across panel remounts (edit ↔ view toggle)
- Mobile responsive: bottom-sheet popup, wrapped toolbar, touch-action pan/pinch
- Honors `prefers-reduced-motion: reduce` and disables flow animations
- Nord-inspired dark theme

### Canvas interactions
- Edge hover dims other edges to 20% for focus-mode read on dense topologies
- Click edge opens metric popup with sparkline and threshold-band pill strip
- Right-click node or edge: context menu with Duplicate, Copy id, Delete, Edit in sidebar
- Shift+drag between nodes creates a new edge with live rubber-band preview
- Click node opens popup with up to 4 summary metrics, sparklines, alerts, and drill-down links
- Double-click node or Edit button scrolls the matching sidebar card into view

### Multi-datasource metric integration
- Prometheus instant queries via datasource proxy
- CloudWatch with namespace, dimensions, stat, and period
- Infinity datasource for any JSON-returning HTTP API (including GraphQL POST bodies)
- Per-metric self-polling with 500ms debounce, AbortController cancellation, and 10s timeout
- Dashboard template variables (`$var`) interpolated into queries and sparkline fetches via `replaceVariables`
- Panel-query fallback via `refId` or `frame.name` match

### Alert integration
- Grafana unified alerting: `useAlertRules` hook matches alerts to nodes via `alertLabelMatchers`
- Configurable poll interval (`animation.alertPollIntervalMs`, default 30s, min 5s)
- Firing-alert badges, rule links, summary annotations, and `runbook_url` deep-links in the popup
- Toolbar stale pill surfaces datasource query failures
- Per-node observability drill-down links with `${token}` URL templating

### Dynamic target queries
- Runtime resolution of one edge definition into N virtual edges, one per discovered target
- Supported across all three datasource types (Prometheus label values, CloudWatch dimensions, Infinity HTTP discovery)
- 60s poll interval; parent-metric value inheritance via `parentId::targetValue` id convention

### Accessibility
- Focus trap in node popup and edge popup (Tab / Shift+Tab, Escape to close)
- Arrow-key navigation and initial focus management in context menu
- Visually-hidden status text beside each node status dot for screen readers

### Editor
- Visual node, edge, and group editors with inline cards
- Search filter in EdgesEditor and GroupsEditor
- Auto-delete orphan edges when a node is deleted
- Round-trip topology export / import as JSON
- Example topology loader (Slot Floor SAS Network)

### Observability
- Per-metric `fetchedAt` freshness timestamps
- Configurable `metricFreshnessSLOSec` threshold with toolbar "N stale" pill
- Live-ticking "Updated Ns ago" labels in popup (15s cadence)

### Build, test, CI
- 165 Jest unit tests across 7 utility modules (93.7% line coverage)
- Component integration tests for NodePopup, EdgePopup, ContextMenu, TopologyPanel
- TopologyCanvas fixture harness with 10 interaction tests (drag, connect, hit-test, wheel)
- GitHub Actions CI (lint, typecheck, test, build) on push + PR
- Tag-triggered release workflow with env-driven plugin signing
- All 44 dependencies pinned to exact versions
- 19 npm audit advisories patched via `overrides`
- Bundle analyzer + composition report
