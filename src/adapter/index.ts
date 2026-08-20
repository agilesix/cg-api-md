/**
 * Public surface of the MD adapter (future `@common-grants/cg-md`).
 *
 * This is the only module that routes, services, ETL, and `src/cg.config.ts`
 * should import from. Deep imports into `./plugin`, `./fields`, etc. are
 * forbidden by lint zones to keep the future package extraction cheap.
 *
 * As of the SDK v0.5.0 architecture there is no bespoke `IAdapter` seam: the
 * `MdPlugin` (`@common-grants/sdk` `definePlugin()`) owns the schema,
 * `sourceSchema`, and the bidirectional `toCommon` / `fromCommon` transforms.
 * The only pieces that live outside the plugin are the operational hooks the
 * SQL tier needs — `getSourceId`, `getModifiedAt`, and `buildSearchText` —
 * plus the HTTP client. See ADR 003 / 005 for the rationale.
 */

import type { MdGrant } from './mdSource';

/** Source-system identifier extractor — the per-source key used for upsert/snapshot keying. */
export const getSourceId = (grant: MdGrant): string => grant.slug;

/**
 * Source last-modified extractor — the per-source field the incremental ETL
 * uses to advance its high-watermark. Compass's `updated_at` is an ISO 8601
 * datetime whose normalized source representation is lexicographically sortable.
 */
export const getModifiedAt = (grant: MdGrant): string => new Date(grant.updated_at).toISOString();

// Plugin + schema + types
export {
  MdPlugin,
  MdOpportunitySchema,
  type MdOpportunity,
  type MdOpportunityInput,
} from './plugin';

// HTTP client
export { MdSourceClient, MdApiError, MdPaginationError } from './MdSourceClient';

// Raw source schema + type (useful for fixtures / tests downstream)
export {
  MdGrantSchema,
  MdGrantSummarySchema,
  MdGrantListResponseSchema,
  type MdGrant,
  type MdGrantSummary,
} from './mdSource';

// Pure transform functions (exported so the ETL/tests can use them directly)
export {
  mdGrantToOpportunity,
  mdOpportunityToGrant,
  buildSearchText,
  portalIdToCgId,
  slugToCgId,
  // Lower-level helpers are exported for testability / advanced use.
  normalizeStatus,
  statusToMdString,
  mapApplicantTypes,
  parseMdContact,
  parseAmountRange,
  parseFinancial,
  parseMatchingFunds,
  moneyToCents,
  splitList,
  splitMdDateTime,
  mdDateToIso,
  stripHtml,
  nullIfEmpty,
  nullIfNotUrl,
} from './transform';

// Value schemas for custom-field values
export {
  AgencyValueSchema,
  ContactInfoValueSchema,
  AdditionalInfoValueSchema,
  EligibilityCriteriaValueSchema,
  AttachmentListValueSchema,
  MdStringListSchema,
} from './fields';
