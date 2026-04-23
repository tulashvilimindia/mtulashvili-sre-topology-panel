# E2E tests

Playwright-based smoke suite for the topology panel plugin, using
[`@grafana/plugin-e2e`](https://github.com/grafana/plugin-tools/tree/main/packages/plugin-e2e)
fixtures.

## Prerequisites

1. Build the plugin into `dist/`:
   ```bash
   npm run build
   ```
2. Install the Playwright browser binaries (first-run only):
   ```bash
   npx playwright install chromium
   ```
3. Start a local Grafana with the plugin mounted (from repo root):
   ```bash
   npm run server
   ```
   This brings up Grafana on `http://localhost:13100` via `docker-compose.yaml`,
   with `dist/` bind-mounted into the plugins directory and anonymous-Admin auth
   enabled.

## Running the suite

```bash
npm run e2e           # run against GRAFANA_URL (default http://localhost:13100)
npm run e2e:list      # dry-run — discover spec files without executing
GRAFANA_URL=http://staging:3000 npm run e2e   # override target
```

## What the smoke suite covers

- Plugin is listed in `/plugins/mtulashvili-sre-topology-panel`.
- "E2E Topology" is discoverable in the visualization picker for a new panel.
- The empty-state panel renders the "Load example" button.

## Extending

Add new `.spec.ts` files in this directory. Import from `@grafana/plugin-e2e`
to get Grafana-specific fixtures (`panelEditPage`, `dashboardPage`, etc.)
rather than calling `page.goto` directly — the fixtures handle Grafana
auth + selectors consistently across versions.

## CI

E2E runs are not part of `npm run test:ci` (which is Jest-only). A
dedicated CI job should:

1. Run `npm run build` to produce `dist/`.
2. Start the docker-compose stack (Grafana + Prometheus).
3. `npx playwright install --with-deps chromium`.
4. `npm run e2e`.

The suite is small by design — deep behavior coverage is handled by the
Jest suite (480+ tests); E2E is a crumb trail that catches plugin-loader
regressions in real Grafana.
