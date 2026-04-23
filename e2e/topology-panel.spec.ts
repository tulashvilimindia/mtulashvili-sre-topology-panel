/**
 * Smoke spec for the E2E Topology panel plugin.
 *
 * These tests exercise the plugin against a live Grafana instance via
 * @grafana/plugin-e2e fixtures. They do NOT run as part of `npm run test`
 * (Jest) — they live in the separate `e2e/` tree driven by Playwright.
 *
 * Prerequisites:
 *   npm run build                  # build dist/
 *   npm run server                 # Docker Grafana on :13100
 *   npx playwright install chromium  # first-run only
 *
 * Then:
 *   npm run e2e
 *
 * CI should run the Docker stack in a job step, then invoke `npm run e2e`.
 * Without a live Grafana these specs will fail to connect — use
 * `npm run e2e:list` to verify the suite compiles without executing.
 */

import { test, expect } from '@grafana/plugin-e2e';

test.describe('E2E Topology panel — smoke', () => {
  test('plugin is listed in the Grafana plugins catalog', async ({ page }) => {
    await page.goto('/plugins/mtulashvili-sre-topology-panel');
    // The plugin-details page renders the plugin name as the H1 heading.
    await expect(page.getByRole('heading', { name: /E2E Topology/i })).toBeVisible();
  });

  test('panel type appears in the visualization picker', async ({ page }) => {
    // Open a brand-new panel editor in an auto-generated dashboard. Then
    // search the visualization picker for our panel id.
    await page.goto('/dashboard/new?panelType=mtulashvili-sre-topology-panel&editPanel=1');
    // The panel's custom editors are registered under "Topology" — assert
    // their category label appears in the right-sidebar panel-options.
    // `getByText` with { exact: false } tolerates any surrounding labels.
    await expect(page.getByText(/Topology/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('panel toolbar exposes the Load example button on empty state', async ({ page }) => {
    await page.goto('/dashboard/new?panelType=mtulashvili-sre-topology-panel&editPanel=1');
    // In view/empty mode the panel surfaces a "Load example" button. The
    // button lives inside the panel iframe-less render and is addressable
    // by its text content.
    const loadExample = page.getByRole('button', { name: /Load example/i });
    await expect(loadExample).toBeVisible({ timeout: 10_000 });
  });
});
