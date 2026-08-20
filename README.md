# MD CommonGrants API

A [CommonGrants](https://commongrants.org)-compliant HTTP API that surfaces Maryland grant data in a standard, interoperable format.

It is a sibling of the [Pennsylvania API](https://github.com/agilesix/cg-api-pa), the [California API](https://github.com/agilesix/cg-api-ca), and the [Washington API](https://github.com/agilesix/cg-api-wa), and shares their architecture; only the `src/adapter/` layer differs.

## Overview

The API fetches public grant programs from the [Maryland Community Compass](https://compass.maryland.gov/incentives/) incentives API, normalizes them into the CommonGrants `Opportunity` schema (plus MD-specific custom fields), and serves them via standard CommonGrants endpoints.

The source client requests records categorized as grants and scoped to state, county, local, or regional programs. It hydrates each list summary from the detail endpoint, then includes records whose funding source is public and whose Compass data-quality rating is not low.

Data is kept fresh by a scheduled ETL that runs **daily**. Compass exposes `updated_at` only on detail records and does not provide an updated-since collection filter, so each sync scans and hydrates the filtered collection before applying the local high-watermark. Detail requests use bounded concurrency, timeouts, and retry backoff. After a successful non-empty scan, stored records that no longer qualify are removed. Syncs run from the scheduled or protected admin handlers, not from ordinary HTTP requests.

**Default deployment:** Cloudflare Workers + D1 (SQLite) + R2 (raw snapshots). Every layer is swappable — see [PORTING.md](PORTING.md) for recipes.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  src/index.ts          (Workers entrypoint)                     │
│     ↓ buildConfig(env)                                          │
│  src/cg.config.ts      (wires adapter + storage + snapshots)    │
│     ↓                                                           │
│  src/app.ts            (Hono factory; accepts AppConfig)        │
├─────────────────────────────────────────────────────────────────┤
│  routes/         services/         etl/ (incremental sync)      │
│     ↓                ↓                ↓                         │
│  ISourceClient · IOppRepo · ISnapshotStore                      │
├─────────────────────────────────────────────────────────────────┤
│  storage/ (pick one IOppRepo impl per deploy)                   │
│    ProxyOppRepo   — tier 0, no persistence                      │
│    SqliteOppRepo  — tier 3, Kysely + D1/SQLite (default)        │
│    (sync_state table holds the incremental high-watermark)      │
│                                                                 │
│  snapshots/                                                     │
│    BucketSnapshotStore  — R2 / S3 / GCS                         │
│    NoopSnapshotStore    — disabled                               │
├─────────────────────────────────────────────────────────────────┤
│  adapter/                                                        │
│    plugin.ts     — definePlugin() → MdPlugin (schema +          │
│                    sourceSchema + toCommon/fromCommon + meta)   │
│    transform.ts  — mdGrantToOpportunity() pure fn               │
│    getSourceId / getModifiedAt / buildSearchText — per-source   │
│                    SQL-tier hooks (getModifiedAt drives the     │
│                    incremental watermark)                       │
│    MdSourceClient — ISourceClient for the MD upstream source     │
│    (future: extract to @common-grants/cg-md)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment tiers

The `IOppRepo` interface supports all tiers; pick one in `src/cg.config.ts`.

| Tier                  | Repository impl            | Storage                | Search                                           | Best for                                            |
| --------------------- | -------------------------- | ---------------------- | ------------------------------------------------ | --------------------------------------------------- |
| **0 — Proxy**         | `ProxyOppRepo`             | None                   | Delegates to source API, or JS filter (fallback) | POC / demos / sources with native search / zero-ops |
| **1 — Memory**        | `MemoryOppRepo` (future)   | Process memory         | JS filter                                        | Node server, single instance, small data            |
| **2 — KV**            | `KvOppRepo` (future)       | CF KV / Upstash        | JS filter on blob                                | Serverless, read-heavy                              |
| **3 — SQL (default)** | `SqliteOppRepo`            | D1 / SQLite via Kysely | SQL WHERE + FTS5                                 | Most production cases                               |
| **4 — Enterprise**    | `PostgresOppRepo` (future) | Postgres / warehouse   | SQL + tsvector / ES                              | Large data, strict security                         |

Routes, services, ETL, adapter, and the plugin layer are **identical across all tiers** — only which `IOppRepo` impl `src/cg.config.ts` wires changes.

## Getting started

See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup and the dev workflow. Short version:

```bash
corepack enable
pnpm install
pnpm exec wrangler login    # one-time
pnpm run bootstrap          # idempotent: creates D1+R2, patches wrangler.jsonc, applies migrations
pnpm run dev
```

Then hit `http://localhost:8787/docs`.

> **No clickops policy.** First-time setup is fully scripted. Don't click through the Cloudflare dashboard — if something's missing from `pnpm run bootstrap`, add it there.

## Project conventions

- **TypeScript + Hono on Cloudflare Workers.** Routes defined with `@hono/zod-openapi` so the OpenAPI spec is auto-generated at `/openapi.json`. Docs UI at `/docs` (Scalar via CDN, no bundled dependency).
- **Schemas from `@common-grants/sdk`.** No handwritten opportunity schema, filters, or pagination envelope — the SDK provides them. Applicant eligibility uses the native `acceptedApplicantTypes` field.
- **Custom fields aligned with the [CommonGrants custom fields catalog](https://commongrants.org/custom-fields/).** Shared concepts use unprefixed keys such as `agency`, `contactInfo`, `additionalInfo`, `eligibilityCriteria`, `attachments`, `fundingSource`, `fundingInstrument`, and `lastSyncedAt`. Compass-specific provenance and eligibility data stays `md*`-prefixed. Applicant eligibility also uses the native `acceptedApplicantTypes` field without inferring more-specific legal categories than Compass supplies.
- **Auto-generated spec validated against the CommonGrants base protocol** via `cg check spec` from `@common-grants/cli`. Runs in CI.
- **Auto-generated SQL types** via `kysely-codegen`. Never hand-edit `src/storage/sql/schema.ts`.
- **No deep cross-directory imports.** Every `src/<dir>/` has an `index.ts` public surface. Lint-enforced.

## Maryland source behavior

- Base API: `https://compass.maryland.gov/api/v1/incentives/`
- Stable source key: `slug`
- Incremental watermark: detail-record `updated_at`
- Included records: public, grant assistance, non-low data quality, and public-sector geographic scopes
- Status: accepting programs are `open`; recurring programs are represented as `custom: Recurring`; all other programs preserve Compass's `custom: Confirm with agency` classification. Deadline dates remain available without being used to infer a stronger status than the source asserts.
- Funding amounts are parsed only from explicit caps, floors, or ranges in `assistance_description`; the complete source text is always retained in `funding.details`

## Forking for a different source system

This template is designed to be forked for any grants source. To adapt it:

1. Replace `src/adapter/` with an adapter for your source (plugin, transform, HTTP client).
2. Update resource names in `wrangler.jsonc` with your state/funder prefix.
3. Update `src/cg.config.ts` to wire your adapter's `ISourceClient`.
4. Pick a deployment tier per [PORTING.md](PORTING.md).

When your source exposes a per-record last-modified field, supply a `getModifiedAt` hook to enable incremental sync (see `src/adapter/index.ts`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Copyright © 2026 Agile Six Applications, Inc.
