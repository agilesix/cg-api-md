import { describe, it, expect } from 'vitest';
import { buildSearchText, getSourceId, mdGrantToOpportunity } from '../../src/adapter';
import { storedFromCommon } from '../../src/storage';
import { ca1Fixture } from '../adapter/fixtures';

/**
 * `storedFromCommon` is the generic projection from a CommonGrants opportunity
 * to the storage-tier `StoredOpportunity` row. Every column except `sourceId`
 * and `searchText` derives from the CG opportunity itself.
 */
describe('storedFromCommon', () => {
  const opp = mdGrantToOpportunity(ca1Fixture, '2026-06-25T00:00:00Z');
  const row = storedFromCommon(opp, {
    sourceId: getSourceId(ca1Fixture),
    searchText: buildSearchText(ca1Fixture),
    contentHash: 'deadbeef',
  });

  it('derives the denormalized columns from the CG opportunity + per-source metadata', () => {
    expect(row).toMatchObject({
      id: opp.id,
      sourceId: 'build-our-future-grant-pilot-program',
      title: 'Build Our Future Grant Program',
      status: 'open',
      minAwardAmountCents: null,
      maxAwardAmountCents: 200_000_000,
      totalAmountAvailableCents: null,
      contentHash: 'deadbeef',
    });
    expect(row.searchText).toContain('MEDCO');
  });

  it('derives close/post dates from keyDates as calendar-date strings', () => {
    expect(row.postDate).toBeNull();
    expect(row.closeDate).toBe('2030-06-30');
  });

  it('serializes the opportunity to rawJson, preserving the string date shape', () => {
    const parsed = JSON.parse(row.rawJson);
    expect(parsed.id).toBe(opp.id);
    expect(parsed.title).toBe(opp.title);
    expect(parsed.keyDates.closeDate.date).toBe('2030-06-30');
  });

  it('leaves money columns null when funding is absent', () => {
    const noFunding = mdGrantToOpportunity(
      { ...ca1Fixture, assistance_description: '' },
      '2026-06-25T00:00:00Z',
    );
    const r = storedFromCommon(noFunding, { sourceId: 'x', searchText: '', contentHash: 'h' });
    expect(r.minAwardAmountCents).toBeNull();
    expect(r.maxAwardAmountCents).toBeNull();
    expect(r.totalAmountAvailableCents).toBeNull();
  });
});
