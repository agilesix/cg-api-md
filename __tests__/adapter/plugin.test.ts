import { describe, expect, it } from 'vitest';
import { MdOpportunitySchema, MdPlugin, mdGrantToOpportunity } from '../../src/adapter';
import { ca1Fixture } from './fixtures';

describe('Maryland Compass plugin', () => {
  it('validates the transformed CommonGrants opportunity', () => {
    const opportunity = mdGrantToOpportunity(ca1Fixture, '2026-08-20T00:00:00Z');
    expect(() => MdOpportunitySchema.parse(opportunity)).not.toThrow();
  });

  it('registers a working source-to-common transform', () => {
    const { result, errors } = MdPlugin.schemas.Opportunity.toCommon(ca1Fixture);
    expect(errors).toEqual([]);
    expect(result.customFields?.mdSlug?.value).toBe(ca1Fixture.slug);
  });
});
