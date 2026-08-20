import type { MdGrant } from '../../src/adapter';

/**
 * A realistic fixture derived from an actual record in the Maryland Grants
 * Portal CKAN DataStore (PortalID 178419, lightly trimmed for determinism).
 * Covers the fully-populated case: an award range, available funds, agency,
 * structured contact, dates, categories, and applicant types.
 */
export const ca1Fixture: MdGrant = {
  PortalID: 'ca-178419',
  GrantID: 'G-001',
  Status: 'active',
  LastUpdated: '2026-06-22 17:23:55',
  ChangeNotes: 'N/A',
  AgencyDept: 'Board of Forestry',
  Title: 'Wood Products Innovation Grant',
  Type: 'Grant',
  LOI: 'No',
  Categories: 'Energy; Environment & Water',
  CategorySuggestion: '',
  Purpose: 'Short purpose text.',
  Description:
    'Supports sustainable forest restoration. <a href="https://bof.example.gov">More info</a>.',
  ApplicantType: 'Business; Individual; Nonprofit; Public Agency; Tribal Government',
  ApplicantTypeNotes: 'Eligible entities and organizations.',
  Geography: '',
  FundingSource: 'State',
  FundingSourceNotes: 'Funded through the Timber Yield Tax.',
  MatchingFunds: 'Not Required',
  MatchingFundsNotes: 'Greater consideration may be given to proposals with match funding.',
  EstAvailFunds: '$1,000,000',
  EstAwards: 'Dependent on number of submissions',
  EstAmounts: 'Between $5,000 and $375,000',
  FundingMethod: 'Reimbursement(s)',
  FundingMethodNotes: 'See the Grant Guidelines for information.',
  OpenDate: '2026-06-22 17:20:00',
  ApplicationDeadline: '2026-08-03 17:00:00',
  AwardPeriod: 'Expires 3/31/29',
  ExpAwardDate: 'November 2026',
  ElecSubmission: 'email: grants@example.gov;',
  GrantURL: 'https://bof.example.gov/grant-guidelines.pdf',
  AgencyURL: 'https://bof.example.gov/',
  AgencySubscribeURL: '',
  GrantEventsURL: '',
  ContactInfo: 'name: Jane Doe; email: grants@example.gov; tel: 1-555-0100;',
  AwardStats: '',
};

/**
 * A fixture exercising edge cases: a percentage matching-funds requirement, an
 * unparseable award range, a forecasted status, empty dates, a single-value
 * "up to" amount, and an unparseable agency URL.
 */
export const ca2FixtureEdgeCases: MdGrant = {
  PortalID: 'md-edge-2',
  GrantID: '',
  Status: 'forecasted',
  LastUpdated: '2026-05-01 09:00:00',
  ChangeNotes: 'Updated estimated amounts',
  AgencyDept: 'Department of Water Resources',
  Title: 'Edge Case Grant',
  Type: 'Grant; Loan',
  LOI: 'Yes',
  Categories: 'Environment & Water',
  CategorySuggestion: '',
  Purpose: 'Fallback purpose used as description.',
  Description: '',
  ApplicantType: 'Public Agency',
  ApplicantTypeNotes: '',
  Geography: 'Statewide',
  FundingSource: '',
  FundingSourceNotes: '',
  MatchingFunds: '35%',
  MatchingFundsNotes: '',
  EstAvailFunds: 'Varies',
  EstAwards: '',
  EstAmounts: 'Up to $50,000',
  FundingMethod: '',
  FundingMethodNotes: '',
  OpenDate: '',
  ApplicationDeadline: '',
  AwardPeriod: '',
  ExpAwardDate: '',
  ElecSubmission: '',
  GrantURL: 'TBD',
  AgencyURL: 'not a url',
  AgencySubscribeURL: '',
  GrantEventsURL: '',
  ContactInfo: 'Grants Office',
  AwardStats: '',
};
