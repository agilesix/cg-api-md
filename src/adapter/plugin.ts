import { z } from 'zod';
import {
  definePlugin,
  type ToCommon,
  type FromCommon,
  type TransformResult,
} from '@common-grants/sdk/extensions';
import {
  AdditionalInfoValueSchema,
  AgencyValueSchema,
  MdStringListSchema,
  ContactInfoValueSchema,
  CostSharingValueSchema,
} from './fields';
import { MdGrantSchema, type MdGrant } from './mdSource';
import { mdGrantToOpportunity, mdOpportunityToGrant } from './transform';

/**
 * MD custom-field specifications, hoisted to a `const` so the same object can
 * be passed to `definePlugin()` **and** referenced by the `ToCommon` /
 * `FromCommon` helper types below. `as const` keeps the `fieldType` literals
 * narrow (per the SDK extensions guide).
 *
 * Extends the base CG `Opportunity` schema with:
 *
 *   - Ecosystem-shared fields (`agency`, `contactInfo`, `additionalInfo`,
 *     `costSharing`) whose value schemas are identical to the grants.gov / PA
 *     plugins — values under these keys are interoperable across plugins per
 *     https://commongrants.org/custom-fields/.
 *   - MD-specific fields (`mdPortalId`, `mdCategories`, `mdFundingSource`,
 *     etc.) for data that has no ecosystem equivalent. The `ca` prefix marks
 *     the namespace; migrate to a shared key if/when one lands upstream.
 */
const mdCustomFields = {
  // --- shared with grants.gov / PA -------------------------------------
  agency: {
    fieldType: 'object',
    value: AgencyValueSchema,
    description: 'Information about the agency offering this opportunity',
  },
  contactInfo: {
    fieldType: 'object',
    value: ContactInfoValueSchema,
    description: 'Contact information (name, email, phone, description) for this resource',
  },
  additionalInfo: {
    fieldType: 'object',
    value: AdditionalInfoValueSchema,
    description: 'URL and description for additional information about the opportunity',
  },
  costSharing: {
    fieldType: 'object',
    value: CostSharingValueSchema,
    description: 'Cost sharing or matching requirement for the opportunity',
  },

  // --- cross-source shared (unprefixed; defined identically in the PA plugin)
  // Open-ended labels whose meaning is equivalent across state sources, so the
  // key is shared rather than `pa*`/`ca*`-prefixed. Candidates to upstream into
  // the commongrants.org custom-field catalog.
  fundingSource: {
    fieldType: 'string',
    description:
      'Where the funding originates (e.g. "State", "Federal", "Federal and State", "Other")',
  },
  fundingInstrument: {
    fieldType: 'string',
    description: 'The funding instrument type (e.g. "Grant", "Loan")',
  },
  lastSyncedAt: {
    fieldType: 'string',
    value: z.string().datetime(),
    description: 'ISO 8601 datetime when this record was last ingested from its source system',
  },

  // --- MD-specific -----------------------------------------------------
  mdPortalId: {
    fieldType: 'string',
    description: "Maryland's Grants Portal identifier (the stable source key)",
  },
  mdGrantId: {
    fieldType: 'string',
    description: "Maryland's internal grant identifier, when assigned (often absent)",
  },
  mdCategories: {
    fieldType: 'array',
    value: MdStringListSchema,
    description: "Maryland's category taxonomy (the source `Categories` list, split)",
  },
  mdLoi: {
    fieldType: 'boolean',
    description: 'Whether a Letter of Intent (LOI) is required before applying',
  },
  mdApplicantTypeNotes: {
    fieldType: 'string',
    description:
      'Free-text notes clarifying applicant eligibility (the standard applicant types are on the native `acceptedApplicantTypes` field)',
  },
  mdGeography: {
    fieldType: 'string',
    description: 'Geographic scope or restrictions for the opportunity',
  },
  mdFundingSourceNotes: {
    fieldType: 'string',
    description: 'Free-text notes about the funding source',
  },
  mdFundingMethod: {
    fieldType: 'string',
    description: 'How funds are disbursed (e.g. "Reimbursement(s)", "Advance(s)")',
  },
  mdFundingMethodNotes: {
    fieldType: 'string',
    description: 'Free-text notes about the funding method',
  },
  mdEstAwards: {
    fieldType: 'string',
    description: 'MD estimate of the number of awards (free-form text)',
  },
  mdEstAmountsRaw: {
    fieldType: 'string',
    description:
      'Original `EstAmounts` range string preserved verbatim (the numeric range is also exposed via `funding.min/maxAwardAmount` when parseable)',
  },
  mdRawEstAvailFunds: {
    fieldType: 'string',
    description:
      'Original `EstAvailFunds` string preserved when the value could not be parsed into a numeric amount',
  },
  mdAwardPeriod: {
    fieldType: 'string',
    description: 'MD award/performance period (free-form, e.g. "Expires 3/31/29")',
  },
  mdExpAwardDate: {
    fieldType: 'string',
    description: 'MD expected award date (free-form, e.g. "November 2026")',
  },
  mdElecSubmission: {
    fieldType: 'string',
    description: 'Electronic submission instructions / address',
  },
  mdAwardStats: {
    fieldType: 'string',
    description: 'MD statistics about prior awards, when published',
  },
  mdCategorySuggestion: {
    fieldType: 'string',
    description: 'Suggested category provided by the source, when present',
  },
  mdChangeNotes: {
    fieldType: 'string',
    description: 'MD-provided notes describing the latest change to the record',
  },
  mdSubscribeUrl: {
    fieldType: 'string',
    description: 'URL to subscribe to updates from the issuing agency',
  },
  mdGrantEventsUrl: {
    fieldType: 'string',
    description: 'URL for grant-related events (webinars, info sessions)',
  },
} as const;

/**
 * Type parameters shared by the `toCommon` / `fromCommon` helper annotations.
 * Type-level inputs only; no runtime schema is referenced here, which keeps
 * this module free of a `plugin ⇄ transform` import cycle.
 */
type MdTransform = {
  model: 'Opportunity';
  sourceSchema: typeof MdGrantSchema;
  customFields: typeof mdCustomFields;
};

/**
 * Source → CommonGrants. A thin wrapper over the pure `mdGrantToOpportunity`
 * mapper. **No validation here on purpose:** `definePlugin()` wraps this
 * callable with `commonSchema` validation, folding any Zod issues into
 * `TransformResult.errors`.
 */
const toCommon: ToCommon<MdTransform> = (source) =>
  ({
    result: mdGrantToOpportunity(source, new Date().toISOString()) as unknown as MdOpportunity,
    errors: [],
  }) satisfies TransformResult<MdOpportunity>;

/**
 * CommonGrants → source (best-effort, lossy — see `mdOpportunityToGrant`).
 * As with `toCommon`, `definePlugin()` wraps this with `sourceSchema`
 * validation, so no explicit parse is needed here.
 */
const fromCommon: FromCommon<MdTransform> = (common) =>
  ({
    result: mdOpportunityToGrant(common as unknown as MdOpportunityInput),
    errors: [],
  }) satisfies TransformResult<MdGrant>;

/**
 * The Maryland CommonGrants plugin. v0.5.0 `definePlugin()` owns the schema
 * extension **and** the bidirectional transforms + source schema (see ADR 005).
 */
export const MdPlugin = definePlugin({
  meta: {
    name: 'md-grants',
    version: '0.1.0',
    sourceSystem: 'md-source',
    capabilities: ['customFields', 'transforms'],
  },
  schemas: {
    Opportunity: {
      customFields: mdCustomFields,
      sourceSchema: MdGrantSchema,
      toCommon,
      fromCommon,
    },
  },
} as const);

/** The CG Opportunity Zod schema extended with MD custom fields. */
export const MdOpportunitySchema = MdPlugin.schemas.Opportunity.commonSchema;

/** Inferred TypeScript type for a MD-flavored Opportunity (output shape — dates as `Date`). */
export type MdOpportunity = z.infer<typeof MdOpportunitySchema>;

/**
 * The **input** type of the MD-extended Opportunity schema — the plain JSON
 * shape before Zod applies its `.transform()` steps (dates as strings). The
 * pure mappers in `./transform` produce and consume this shape.
 */
export type MdOpportunityInput = z.input<typeof MdOpportunitySchema>;
