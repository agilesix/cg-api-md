import { describe, expect, it } from 'vitest';
import {
  buildSearchText,
  mapApplicantTypes,
  mdGrantToOpportunity,
  mdOpportunityToGrant,
  normalizeStatus,
  parseAmountRange,
  slugToCgId,
} from '../../src/adapter';
import { ca1Fixture, ca2FixtureEdgeCases } from './fixtures';

describe('Maryland Compass transform', () => {
  it('creates stable ids and maps core source fields', () => {
    const opportunity = mdGrantToOpportunity(ca1Fixture, '2026-08-20T00:00:00Z');
    expect(opportunity.id).toBe(slugToCgId(ca1Fixture.slug));
    expect(opportunity.title).toBe('Build Our Future Grant Program');
    expect(opportunity.status.value).toBe('open');
    expect(opportunity.funding?.maxAwardAmount?.amount).toBe('2000000.00');
    expect(opportunity.keyDates?.closeDate).toMatchObject({ date: '2030-06-30' });
    expect(opportunity.customFields?.mdEligibleCounties?.value).toEqual(['All']);
    expect(opportunity.customFields?.attachments?.value).toHaveLength(1);
  });

  it('does not call a recurring but currently closed program open', () => {
    expect(
      normalizeStatus({
        ...ca2FixtureEdgeCases,
        is_recurring: true,
        is_accepting_applications: false,
      }),
    ).toEqual({ value: 'custom', customValue: 'Recurring' });
  });

  it('preserves confirm-with-agency status regardless of a historical deadline', () => {
    expect(
      normalizeStatus({ ...ca2FixtureEdgeCases, application_deadline_date: '2020-01-01' }),
    ).toEqual({ value: 'custom', customValue: 'Confirm with agency' });
    expect(normalizeStatus(ca2FixtureEdgeCases)).toEqual({
      value: 'custom',
      customValue: 'Confirm with agency',
    });
  });

  it('does not overstate coarse applicant categories', () => {
    expect(mapApplicantTypes(['individuals', 'government'])).toEqual([
      { value: 'individual', customValue: null, description: null },
      { value: 'custom', customValue: 'government', description: null },
    ]);
  });

  it('parses ranges and up-to amounts from assistance text', () => {
    expect(parseAmountRange('$5,000 to $25,000')).toMatchObject({
      min: { amount: '5000.00' },
      max: { amount: '25000.00' },
    });
    expect(parseAmountRange('up to $2 million').max?.amount).toBe('2000000.00');
  });

  it('does not turn historical or total program funding into an award cap', () => {
    expect(parseAmountRange('$263,000 was allocated across multiple recipients')).toEqual({
      min: null,
      max: null,
    });
    expect(parseAmountRange('The program previously received a $997,266 EPA grant')).toEqual({
      min: null,
      max: null,
    });
    expect(parseAmountRange('Approximately $400,000 in funding is anticipated')).toEqual({
      min: null,
      max: null,
    });
  });

  it('prefers an explicit range over unrelated later cap language', () => {
    expect(
      parseAmountRange(
        'Annual awards range from a minimum of $1,000 to a maximum of $5,000. Funding may continue for up to eight semesters.',
      ),
    ).toMatchObject({ min: { amount: '1000.00' }, max: { amount: '5000.00' } });
    expect(
      parseAmountRange('Provides a $5,000–$10,000 incentive and a separate loan of up to $35,000.'),
    ).toMatchObject({ min: { amount: '5000.00' }, max: { amount: '10000.00' } });
  });

  it('keeps malformed attachment encoding from aborting the transform', () => {
    const opportunity = mdGrantToOpportunity(
      { ...ca1Fixture, attachment_urls: ['https://example.gov/%E0%A4%A'] },
      '2026-08-20T00:00:00Z',
    );
    expect(opportunity.customFields?.attachments?.value).toEqual([
      {
        downloadUrl: 'https://example.gov/%E0%A4%A',
        name: '%E0%A4%A',
        mimeType: null,
      },
    ]);
  });

  it('round-trips the source-specific fields required by the plugin', () => {
    const opportunity = mdGrantToOpportunity(ca1Fixture, '2026-08-20T00:00:00Z');
    const grant = mdOpportunityToGrant(opportunity);
    expect(grant.slug).toBe(ca1Fixture.slug);
    expect(grant.id).toBe(ca1Fixture.id);
    expect(grant.requirements_list).toEqual(ca1Fixture.requirements_list);
  });

  it('builds useful search text', () => {
    const text = buildSearchText(ca1Fixture);
    expect(text).toContain('MEDCO');
    expect(text).toContain('Manufacturing');
    expect(text).toContain('Matching funds are required');
  });
});
