import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MdApiError, MdSourceClient } from '../../src/adapter';
import { ca1Fixture } from './fixtures';

const BASE = 'https://compass.maryland.gov/api/v1';
const summary = {
  slug: ca1Fixture.slug,
  program_name: ca1Fixture.program_name,
  agency: ca1Fixture.agency,
  URL: ca1Fixture.URL,
  is_accepting_applications: true,
  is_recurring: true,
  data_quality: 'high',
  funding_source: 'public',
  geographic_scope: 'statewide',
  assistance_type: ['grant'],
  eligible_industries: [],
  eligible_counties: ['All'],
  eligible_incentive_areas: [],
  eligible_organization_types: [],
  application_deadline_string: '',
  application_deadline_date: '',
  program_description: '',
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

describe('MdSourceClient', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.restoreAllMocks());

  it('gets a qualifying grant by its encoded slug', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(ca1Fixture));
    const result = await new MdSourceClient(BASE).getGrant(ca1Fixture.slug);
    expect(result?.id).toBe(1046);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      `/incentives/${ca1Fixture.slug}/`,
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      headers: {
        accept: 'application/json',
        'user-agent': 'cg-api-md/0.1 (+https://github.com/agilesix/cg-api-md)',
      },
    });
  });

  it('normalizes nullable Compass metadata', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ ...ca1Fixture, is_recurring: null, source_count: null }),
    );
    const result = await new MdSourceClient(BASE).getGrant(ca1Fixture.slug);
    expect(result).toMatchObject({ is_recurring: false, source_count: 0 });
  });

  it('returns null for 404 and excluded private or low-quality records', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(json({ ...ca1Fixture, funding_source: 'private' }))
      .mockResolvedValueOnce(json({ ...ca1Fixture, data_quality: 'low' }));
    const client = new MdSourceClient(BASE);
    await expect(client.getGrant('missing')).resolves.toBeNull();
    await expect(client.getGrant('private')).resolves.toBeNull();
    await expect(client.getGrant('low-quality')).resolves.toBeNull();
  });

  it('hydrates the full list for reconciliation and follows pagination', async () => {
    const page2 = `${BASE}/incentives/?page=2`;
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ count: 2, next: page2, previous: null, results: [summary] }))
      .mockResolvedValueOnce(json(ca1Fixture))
      .mockResolvedValueOnce(
        json({ count: 2, next: null, previous: BASE, results: [{ ...summary, slug: 'older' }] }),
      )
      .mockResolvedValueOnce(
        json({ ...ca1Fixture, id: 2, slug: 'older', updated_at: '2026-01-01T00:00:00Z' }),
      );

    const grants = [];
    for await (const grant of new MdSourceClient(BASE).listAll({ since: '2026-08-01T00:00:00Z' })) {
      grants.push(grant.slug);
    }
    expect(grants).toEqual([ca1Fixture.slug, 'older']);
    const firstUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(firstUrl).toContain('assistance=grant');
    expect(firstUrl).toContain('scope=State');
    expect(firstUrl).toContain('scope=Regional');
  });

  it('rejects a truncated successful pagination sequence', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ count: 2, next: null, previous: null, results: [summary] }))
      .mockResolvedValueOnce(json(ca1Fixture));

    const consume = async () => {
      for await (const _grant of new MdSourceClient(BASE).listAll()) {
        // Consume the complete generator so its reconciliation guard runs.
      }
    };
    await expect(consume()).rejects.toThrow('received 1 of 2 summaries');
  });

  it('retries a transient rate-limit response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }),
      )
      .mockResolvedValueOnce(json(ca1Fixture));

    await expect(new MdSourceClient(BASE).getGrant(ca1Fixture.slug)).resolves.toMatchObject({
      slug: ca1Fixture.slug,
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('retries a transient server error', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response('unavailable', { status: 503, headers: { 'retry-after': '0' } }),
      )
      .mockResolvedValueOnce(json(ca1Fixture));

    await expect(new MdSourceClient(BASE).getGrant(ca1Fixture.slug)).resolves.toMatchObject({
      slug: ca1Fixture.slug,
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it('throws a typed error for upstream failures', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 400 }));
    await expect(new MdSourceClient(BASE).getGrant('x')).rejects.toBeInstanceOf(MdApiError);
  });
});
