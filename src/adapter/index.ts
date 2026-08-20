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
export const getSourceId = (grant: MdGrant): string => grant.PortalID;

/**
 * Source last-modified extractor — the per-source field the incremental ETL
 * uses to advance its high-watermark. MD's `LastUpdated` is a lexicographically
 * sortable `"YYYY-MM-DD HH:MM:SS"` string, compared verbatim (no normalization).
 */
export const getModifiedAt = (grant: MdGrant): string => grant.LastUpdated;

// Plugin + schema + types
export {
  MdPlugin,
  MdOpportunitySchema,
  type MdOpportunity,
  type MdOpportunityInput,
} from './plugin';

// HTTP client
export { MdSourceClient, MdApiError } from './MdSourceClient';

// Raw source schema + type (useful for fixtures / tests downstream)
export { MdGrantSchema, CkanDatastoreResponseSchema, type MdGrant } from './mdSource';

// Pure transform functions (exported so the ETL/tests can use them directly)
export {
  mdGrantToOpportunity,
  mdOpportunityToGrant,
  buildSearchText,
  portalIdToCgId,
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
  CostSharingValueSchema,
  MdStringListSchema,
} from './fields';
