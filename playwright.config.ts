import { defineConfig, devices } from '@playwright/test';

// Grafana dev stack from docker-compose.yaml binds to :13100 (see README
// "Local Development Setup"). Override via GRAFANA_URL for CI / different
// hosts. Anonymous auth is enabled on the dev image (Admin role), so
// individual tests don't need explicit login.
const GRAFANA_URL = process.env.GRAFANA_URL ?? 'http://localhost:13100';

/**
 * Playwright config for the E2E smoke suite that ships alongside the
 * plugin. Tests live in `e2e/` and use @grafana/plugin-e2e fixtures to
 * drive a real Grafana instance against this plugin.
 *
 * Running requires a live Grafana — see e2e/README.md for setup.
 *   npm run server    # Docker Grafana on :13100 with this plugin mounted
 *   npm run e2e       # run the suite against Grafana
 *   npm run e2e:list  # dry-run — verify spec discovery without Grafana
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: GRAFANA_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
