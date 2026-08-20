import type { ISourceClient } from '../core';
import { CkanDatastoreResponseSchema, type MdGrant } from './mdSource';

/**
 * Typed error thrown by `MdSourceClient` when the upstream CKAN DataStore
 * returns a non-OK status or an unsuccessful body. Exposes both the HTTP
 * status and the raw response body so callers can distinguish transient
 * (server-error) from permanent (client-error) failures.
 */
export class MdApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`MD API returned ${status}: ${body.slice(0, 200)}`);
    this.name = 'MdApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Number of records requested per page. CKAN caps the effective `limit` at
 * 50,000 (it silently clamps larger values), and the full dataset is ~1,942
 * rows, so any page size ≥ the dataset would work in one request. We page in
 * chunks of 1,000 anyway so a future dataset growth, or a slow-changing
 * incremental scan, stays bounded per request.
 */
const PAGE_SIZE = 1000;

/**
 * HTTP client for the Maryland Grants Portal, published as a CKAN DataStore
 * resource on `data.example.gov`.
 *
 * The upstream shape (as of 2026-06):
 *
 *   - `GET /datastore_search?resource_id=…` returns
 *     `{ success, result: { records: MdGrant[], total, _links } }`.
 *   - `limit` + `offset` paginate; `sort=LastUpdated desc` orders newest-first.
 *   - `filters={"PortalID":"…"}` fetches a single record by its portal id.
 *   - No auth, no rate limiting observed.
 *
 * Implements {@link ISourceClient} so the ETL and the proxy repository can
 * consume it without knowing it's MD-specific.
 *
 * **Incremental scans.** `listAll({ since })` orders records newest-first and
 * stops as soon as it crosses the `since` watermark — so a steady-state sync
 * (≈ tens of changed rows) returns in a single page instead of re-streaming
 * the whole dataset. `since` is compared against MD's raw `LastUpdated`
 * string, which is lexicographically sortable (`"YYYY-MM-DD HH:MM:SS"`).
 */
export class MdSourceClient implements ISourceClient<MdGrant> {
  private readonly actionUrl: string;
  private readonly resourceId: string;

  /**
   * @param baseUrl    CKAN action API base, e.g. `https://data.example.gov/api/3/action`.
   * @param resourceId The DataStore resource id for the grants table.
   */
  constructor(baseUrl: string, resourceId: string) {
    // Normalize to no trailing slash so we can uniformly append `/datastore_search`.
    this.actionUrl = baseUrl.replace(/\/+$/, '');
    this.resourceId = resourceId;
  }

  async getGrant(portalId: string): Promise<MdGrant | null> {
    const filters = encodeURIComponent(JSON.stringify({ PortalID: portalId }));
    const url =
      `${this.actionUrl}/datastore_search?resource_id=${encodeURIComponent(this.resourceId)}` +
      `&filters=${filters}&limit=1`;
    const body = await this.fetchPage(url);
    return body.result.records[0] ?? null;
  }

  /**
   * Iterate every record, newest-first. When `since` is provided, stop as soon
   * as a record older than the watermark is reached (the `>=` boundary is
   * intentional — a record whose `LastUpdated` equals the watermark is
   * re-yielded so a same-second update on a later run isn't missed; the ETL's
   * content-hash short-circuit makes the re-yield a cheap no-op).
   */
  async *listAll(opts: { since?: string | null } = {}): AsyncGenerator<MdGrant> {
    const since = opts.since ?? null;
    let offset = 0;

    for (;;) {
      const url =
        `${this.actionUrl}/datastore_search?resource_id=${encodeURIComponent(this.resourceId)}` +
        `&limit=${PAGE_SIZE}&offset=${offset}&sort=${encodeURIComponent('LastUpdated desc')}`;
      const body = await this.fetchPage(url);
      const records = body.result.records;
      if (records.length === 0) return;

      for (const rec of records) {
        // Records are newest-first: once we drop below the watermark, every
        // remaining record (this page and all later pages) is older too.
        if (since !== null && rec.LastUpdated < since) return;
        yield rec;
      }

      // A short page means we've reached the end of the dataset.
      if (records.length < PAGE_SIZE) return;
      offset += PAGE_SIZE;
    }
  }

  /** Fetch + validate a single CKAN page. Throws {@link MdApiError} on failure. */
  private async fetchPage(url: string): Promise<CkanDatastoreResponse> {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new MdApiError(res.status, await res.text());
    const json = (await res.json()) as unknown;
    const body = CkanDatastoreResponseSchema.parse(json);
    if (!body.success) throw new MdApiError(res.status, JSON.stringify(json).slice(0, 500));
    return body;
  }
}

type CkanDatastoreResponse = ReturnType<typeof CkanDatastoreResponseSchema.parse>;
