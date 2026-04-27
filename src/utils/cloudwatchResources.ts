/**
 * cloudwatchResources.ts — thin wrappers around Grafana's CloudWatch
 * datasource resource API. Used by MetricEditor and EdgeCard to
 * populate Namespace / Metric name / Dimension key dropdowns with
 * live AWS data instead of plain text inputs.
 *
 * Endpoints (all GET, all require a region query param):
 *   /api/datasources/uid/{uid}/resources/namespaces
 *   /api/datasources/uid/{uid}/resources/metrics?namespace=
 *   /api/datasources/uid/{uid}/resources/dimension-keys?namespace=&metricName=&dimensionFilters={}
 *
 * Each endpoint returns a slightly different shape — namespaces and
 * dimension-keys are flat strings inside `value`, but metrics nests a
 * `{ name, namespace }` object under `value`. We pick a Selector per
 * endpoint to normalize to `string[]`.
 */

import { getDataSourceSrv } from '@grafana/runtime';

/** Hardcoded list of standard AWS regions used to populate the region
 *  picker when the datasource has no default region configured (or when
 *  /resources/regions can't be reached). Order roughly follows user volume
 *  (us/eu first, then Asia Pacific, then others). */
export const AWS_REGIONS: Array<{ label: string; value: string }> = [
  { label: 'US East (N. Virginia) — us-east-1', value: 'us-east-1' },
  { label: 'US East (Ohio) — us-east-2', value: 'us-east-2' },
  { label: 'US West (N. California) — us-west-1', value: 'us-west-1' },
  { label: 'US West (Oregon) — us-west-2', value: 'us-west-2' },
  { label: 'Europe (Ireland) — eu-west-1', value: 'eu-west-1' },
  { label: 'Europe (London) — eu-west-2', value: 'eu-west-2' },
  { label: 'Europe (Paris) — eu-west-3', value: 'eu-west-3' },
  { label: 'Europe (Frankfurt) — eu-central-1', value: 'eu-central-1' },
  { label: 'Europe (Zurich) — eu-central-2', value: 'eu-central-2' },
  { label: 'Europe (Stockholm) — eu-north-1', value: 'eu-north-1' },
  { label: 'Europe (Milan) — eu-south-1', value: 'eu-south-1' },
  { label: 'Europe (Spain) — eu-south-2', value: 'eu-south-2' },
  { label: 'Asia Pacific (Tokyo) — ap-northeast-1', value: 'ap-northeast-1' },
  { label: 'Asia Pacific (Seoul) — ap-northeast-2', value: 'ap-northeast-2' },
  { label: 'Asia Pacific (Osaka) — ap-northeast-3', value: 'ap-northeast-3' },
  { label: 'Asia Pacific (Singapore) — ap-southeast-1', value: 'ap-southeast-1' },
  { label: 'Asia Pacific (Sydney) — ap-southeast-2', value: 'ap-southeast-2' },
  { label: 'Asia Pacific (Jakarta) — ap-southeast-3', value: 'ap-southeast-3' },
  { label: 'Asia Pacific (Melbourne) — ap-southeast-4', value: 'ap-southeast-4' },
  { label: 'Asia Pacific (Mumbai) — ap-south-1', value: 'ap-south-1' },
  { label: 'Asia Pacific (Hyderabad) — ap-south-2', value: 'ap-south-2' },
  { label: 'Asia Pacific (Hong Kong) — ap-east-1', value: 'ap-east-1' },
  { label: 'Canada (Central) — ca-central-1', value: 'ca-central-1' },
  { label: 'South America (São Paulo) — sa-east-1', value: 'sa-east-1' },
  { label: 'Middle East (Bahrain) — me-south-1', value: 'me-south-1' },
  { label: 'Middle East (UAE) — me-central-1', value: 'me-central-1' },
  { label: 'Africa (Cape Town) — af-south-1', value: 'af-south-1' },
  { label: 'Israel (Tel Aviv) — il-central-1', value: 'il-central-1' },
];

/**
 * Resolve the datasource's default region from its instanceSettings.jsonData.
 * Falls back to 'us-east-1' if unset.
 */
export function getCloudWatchDefaultRegion(dsUid: string): string {
  try {
    const settings = getDataSourceSrv().getInstanceSettings(dsUid);
    const jsonData = settings?.jsonData as { defaultRegion?: string } | undefined;
    return jsonData?.defaultRegion || 'us-east-1';
  } catch {
    return 'us-east-1';
  }
}

// Grafana's CloudWatch resource endpoints return slightly different shapes
// per endpoint. All are arrays of objects, but the interesting string lives
// in different fields:
//   namespaces:     [{ value: "AWS/EC2" }]
//   metrics:        [{ value: { name: "CPUUtilization", namespace: "AWS/EC2" } }]
//   dimension-keys: [{ text: "InstanceId", value: "InstanceId", label: "InstanceId" }]
// Each fetch function applies its own selector.
type Selector = (entry: unknown) => string | undefined;

async function fetchResourceWith(
  dsUid: string,
  path: string,
  select: Selector,
  signal?: AbortSignal
): Promise<string[]> {
  const res = await fetch(`/api/datasources/uid/${dsUid}/resources/${path}`, { signal });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map(select)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

const selectStringValue: Selector = (entry) => {
  if (entry && typeof entry === 'object') {
    const rec = entry as Record<string, unknown>;
    if (typeof rec.value === 'string') { return rec.value; }
    if (typeof rec.text === 'string') { return rec.text; }
  }
  return undefined;
};

const selectMetricName: Selector = (entry) => {
  if (entry && typeof entry === 'object') {
    const rec = entry as Record<string, unknown>;
    // Modern shape: { value: { name, namespace } }
    if (rec.value && typeof rec.value === 'object') {
      const nested = rec.value as Record<string, unknown>;
      if (typeof nested.name === 'string') { return nested.name; }
    }
    // Fallback: flat string value
    if (typeof rec.value === 'string') { return rec.value; }
    if (typeof rec.text === 'string') { return rec.text; }
  }
  return undefined;
};

/** List AWS namespaces available to the datasource in the given region. */
export function fetchCwNamespaces(dsUid: string, region: string, signal?: AbortSignal): Promise<string[]> {
  return fetchResourceWith(dsUid, `namespaces?region=${encodeURIComponent(region)}`, selectStringValue, signal);
}

/** List metric names in a namespace (e.g. CPUUtilization for AWS/EC2). */
export function fetchCwMetrics(
  dsUid: string,
  region: string,
  namespace: string,
  signal?: AbortSignal
): Promise<string[]> {
  const qs = `region=${encodeURIComponent(region)}&namespace=${encodeURIComponent(namespace)}`;
  return fetchResourceWith(dsUid, `metrics?${qs}`, selectMetricName, signal);
}

/** List dimension keys for a specific metric in a namespace. */
export function fetchCwDimensionKeys(
  dsUid: string,
  region: string,
  namespace: string,
  metricName: string,
  signal?: AbortSignal
): Promise<string[]> {
  const qs =
    `region=${encodeURIComponent(region)}` +
    `&namespace=${encodeURIComponent(namespace)}` +
    `&metricName=${encodeURIComponent(metricName)}` +
    `&dimensionFilters=${encodeURIComponent('{}')}`;
  return fetchResourceWith(dsUid, `dimension-keys?${qs}`, selectStringValue, signal);
}
