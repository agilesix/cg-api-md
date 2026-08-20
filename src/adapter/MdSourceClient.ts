import type { ISourceClient } from '../core';
import { MdGrantListResponseSchema, MdGrantSchema, type MdGrant } from './mdSource';

export class MdApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Maryland Compass API returned ${status}: ${body.slice(0, 200)}`);
    this.name = 'MdApiError';
  }
}

export class MdPaginationError extends Error {
  constructor(message: string) {
    super(`Maryland Compass pagination was incomplete: ${message}`);
    this.name = 'MdPaginationError';
  }
}

const PUBLIC_SCOPES = ['State', 'County', 'Local', 'Regional'] as const;
const DETAIL_CONCURRENCY = 5;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const REQUEST_HEADERS = {
  accept: 'application/json',
  'user-agent': 'cg-api-md/0.1 (+https://github.com/agilesix/cg-api-md)',
} as const;

/** Read-only client for Maryland Community Compass's incentives REST API. */
export class MdSourceClient implements ISourceClient<MdGrant> {
  private readonly collectionUrl: string;

  constructor(baseUrl: string) {
    const normalized = baseUrl.replace(/\/+$/, '');
    this.collectionUrl = normalized.endsWith('/incentives')
      ? `${normalized}/`
      : `${normalized}/incentives/`;
  }

  async getGrant(slug: string): Promise<MdGrant | null> {
    const url = new URL(`${encodeURIComponent(slug)}/`, this.collectionUrl);
    const response = await this.fetchWithRetry(url);
    if (response.status === 404) return null;
    if (!response.ok) throw new MdApiError(response.status, await response.text());
    const grant = MdGrantSchema.parse((await response.json()) as unknown);
    return isIncludedGrant(grant) ? grant : null;
  }

  /** Compass exposes timestamps only on details, so each summary is hydrated. */
  async *listAll(opts: { since?: string | null } = {}): AsyncGenerator<MdGrant> {
    // Compass has no collection-level updated-since filter and reconciliation
    // requires the complete qualifying source-id set. Detail records are
    // therefore yielded in full; the ETL content hashes unchanged rows.
    void opts;
    let next: string | null = this.buildFirstPageUrl();
    let expectedCount: number | null = null;
    let summariesSeen = 0;
    const seenSlugs = new Set<string>();
    while (next) {
      const page = await this.fetchList(next);
      if (expectedCount === null) expectedCount = page.count;
      if (page.count !== expectedCount) {
        throw new MdPaginationError(
          `advertised count changed from ${expectedCount} to ${page.count}`,
        );
      }
      summariesSeen += page.results.length;
      for (const summary of page.results) {
        if (seenSlugs.has(summary.slug)) {
          throw new MdPaginationError(`duplicate slug ${summary.slug}`);
        }
        seenSlugs.add(summary.slug);
      }
      const details = await mapWithConcurrency(page.results, DETAIL_CONCURRENCY, (summary) =>
        this.getGrant(summary.slug),
      );
      for (const grant of details) {
        if (!grant) continue;
        // Compass does not sort the collection by updated_at, so a delta sync
        // must scan every page and filter only after detail hydration.
        yield grant;
      }
      next = page.next;
      if (next === null && summariesSeen !== expectedCount) {
        throw new MdPaginationError(`received ${summariesSeen} of ${expectedCount} summaries`);
      }
    }
  }

  private buildFirstPageUrl(): string {
    const url = new URL(this.collectionUrl);
    url.searchParams.append('assistance', 'grant');
    for (const scope of PUBLIC_SCOPES) url.searchParams.append('scope', scope);
    return url.toString();
  }

  private async fetchList(url: string) {
    const response = await this.fetchWithRetry(url);
    if (!response.ok) throw new MdApiError(response.status, await response.text());
    return MdGrantListResponseSchema.parse((await response.json()) as unknown);
  }

  private async fetchWithRetry(url: string | URL): Promise<Response> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          headers: REQUEST_HEADERS,
          signal: controller.signal,
        });
        if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
          return response;
        }
        await response.body?.cancel();
        await delay(retryDelayMs(response, attempt));
      } catch (error) {
        lastError = error;
        if (attempt === MAX_ATTEMPTS) throw error;
        await delay(250 * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Maryland Compass request failed');
  }
}

export function isIncludedGrant(grant: MdGrant): boolean {
  const quality = grant.data_quality.toLowerCase();
  return (
    grant.funding_source.toLowerCase() === 'public' &&
    (quality === 'medium' || quality === 'high') &&
    grant.assistance_type.some((type) => type.toLowerCase() === 'grant')
  );
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1_000, 5_000);
  }
  return 250 * 2 ** (attempt - 1);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
