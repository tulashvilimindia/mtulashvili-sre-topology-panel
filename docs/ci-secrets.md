# CI Secrets

The release workflow (`.github/workflows/release.yml`) requires two repository
secrets to sign and publish the plugin. Configure them at:

**GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

## `GRAFANA_ACCESS_POLICY_TOKEN`

Used by `@grafana/sign-plugin` to authenticate against Grafana Labs' signing
service. The token is bound to a Grafana Cloud organization but is valid for
signing private plugins regardless of deployment target.

### How to generate

1. Log in to https://grafana.com (free account works — doesn't need a paid org).
2. Navigate to **My Account → Security → Access Policies**.
3. Click **Create access policy**.
4. Name: `plugin-signing-mtulashvili-sre-topology-panel` (or similar).
5. Realm: your Grafana Cloud organization.
6. Scopes: **`plugins:write`** only — least privilege.
7. Click **Add token**, set a 1-year expiration, copy the `glc_...` token value.
8. Paste into the GitHub secret as `GRAFANA_ACCESS_POLICY_TOKEN`.

### Rotation

Tokens expire 1 year after creation. Set a calendar reminder 30 days before
expiry — releases will fail silently (or with an auth error) once the token
expires. Rotate by generating a new token and updating the GitHub secret.

## `GRAFANA_ROOT_URLS`

Comma-separated list of Grafana instance URLs where this signed plugin is
allowed to load. The release workflow reads this secret, parses the CSV, and
overwrites the `rootUrls` field in `dist/plugin.json` before calling
`@grafana/sign-plugin`. A signed plugin will refuse to load on a Grafana
instance whose URL doesn't match one of these entries.

### Format

```
https://grafana.prod.example.com/,https://grafana.staging.example.com/,http://localhost:13100/
```

Rules:
- Each URL must end with a trailing slash.
- Protocol must match exactly (`http://` and `https://` are distinct entries).
- Include every Grafana URL where the plugin will load — dev, staging, prod.
- Subdomain wildcards work: `https://*.example.com/`
- No wildcards in paths.

### Source-tree default

`src/plugin.json` contains only `http://localhost:13100/` as the default
rootUrl for local dev. Production URLs are intentionally NOT committed — they
are injected at CI time from the `GRAFANA_ROOT_URLS` secret. This keeps forks
and per-deployment branches clean and lets anyone sign with their own URLs
using only their own CI secrets.

## Release flow

1. Push a tag: `git tag v1.1.0 && git push --tags`
2. GitHub Actions kicks off `.github/workflows/release.yml`
3. The workflow runs lint → typecheck → test → build (same as CI)
4. It parses `GRAFANA_ROOT_URLS` and writes them into `dist/plugin.json`
5. It runs `@grafana/sign-plugin` with `GRAFANA_ACCESS_POLICY_TOKEN`
6. It zips `dist/` and uploads as a signed release artifact

If either secret is missing or empty, the workflow fails fast with a clear
error before reaching the signing step.

## CI-only verification

The non-release `.github/workflows/ci.yml` workflow runs on every push and PR
but does NOT sign or release. It only verifies that the code builds cleanly
and passes lint/typecheck/tests. No secrets are required for CI.
