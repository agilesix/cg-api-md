import { v5 as uuidv5 } from 'uuid';
import type { MdGrant } from './mdSource';
import type { MdOpportunityInput } from './plugin';

type CustomField = NonNullable<MdOpportunityInput['customFields']>[string];
type ApplicantType = NonNullable<MdOpportunityInput['acceptedApplicantTypes']>[number];
type Money = { amount: string; currency: 'USD' };

const MD_NAMESPACE = uuidv5('md.compass.commongrants.api', uuidv5.DNS);
const COMPASS_BASE = 'https://compass.maryland.gov/incentives/';

export function slugToCgId(slug: string): string {
  return uuidv5(slug, MD_NAMESPACE);
}

/** Backward-compatible export retained for callers of the scaffold. */
export const portalIdToCgId = slugToCgId;

export function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

export function nullIfNotUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function stripHtml(value: string | null): string | null {
  if (!value) return null;
  const plain = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return plain || null;
}

export function splitList(value: string | null): string[] {
  return (
    value
      ?.split(';')
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  );
}

const money = (amount: number): Money => ({ amount: amount.toFixed(2), currency: 'USD' });

export function parseFinancial(value: string | null): Money | null {
  if (!value) return null;
  const match = value.match(/\$\s*([\d][\d,]*(?:\.\d+)?)\s*(million|thousand|m|k)?/i);
  if (!match) return null;
  let amount = Number((match[1] ?? '').replace(/,/g, ''));
  const unit = (match[2] ?? '').toLowerCase();
  if (unit === 'm' || unit === 'million') amount *= 1_000_000;
  if (unit === 'k' || unit === 'thousand') amount *= 1_000;
  return Number.isFinite(amount) ? money(amount) : null;
}

export function parseAmountRange(value: string | null): { min: Money | null; max: Money | null } {
  if (!value) return { min: null, max: null };
  const amount = String.raw`\$\s*[\d][\d,]*(?:\.\d+)?\s*(?:million|thousand|m|k)?`;
  const rangePatterns = [
    new RegExp(
      String.raw`\b(?:between|from)\s+(?:(?:a\s+)?(?:minimum|min\.?)\s+of\s+)?(${amount})\s+(?:and|to|through|-|–|—)\s*(?:(?:a\s+)?(?:maximum|max\.?)\s+of\s+)?(${amount})`,
      'i',
    ),
    new RegExp(String.raw`(${amount})\s*(?:to|through|-|–|—)\s*(${amount})`, 'i'),
  ];
  for (const pattern of rangePatterns) {
    const match = value.match(pattern);
    const first = parseFinancial(match?.[1] ?? null);
    const second = parseFinancial(match?.[2] ?? null);
    if (first && second) {
      const amounts = [Number(first.amount), Number(second.amount)];
      return { min: money(Math.min(...amounts)), max: money(Math.max(...amounts)) };
    }
  }

  const cap = value.match(
    new RegExp(
      String.raw`\b(?:up to|maximum(?:\s+award)?(?:\s+of)?|max\.?|not more than)\s*(?:an?\s+)?(${amount})`,
      'i',
    ),
  );
  const max = parseFinancial(cap?.[1] ?? null);
  if (max) return { min: null, max };

  const floor = value.match(
    new RegExp(
      String.raw`\b(?:at least|minimum(?:\s+award)?(?:\s+of)?|min\.?|starting at|not less than)\s*(?:an?\s+)?(${amount})`,
      'i',
    ),
  );
  const min = parseFinancial(floor?.[1] ?? null);
  if (min) return { min, max: null };

  return { min: null, max: null };
}

export function moneyToCents(value: { amount: string } | null | undefined): number | null {
  if (!value) return null;
  const amount = Number(value.amount);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export function normalizeStatus(
  grant: Pick<MdGrant, 'is_accepting_applications' | 'is_recurring' | 'application_deadline_date'>,
): {
  value: 'forecasted' | 'open' | 'closed' | 'custom';
  customValue: string | null;
} {
  if (grant.is_accepting_applications) {
    return { value: 'open', customValue: null };
  }
  if (grant.is_recurring) {
    return { value: 'custom', customValue: 'Recurring' };
  }
  return { value: 'custom', customValue: 'Confirm with agency' };
}

export function statusToMdString(status: { value: string; customValue?: string | null }): string {
  return status.value === 'custom' ? (status.customValue ?? '') : status.value;
}

const APPLICANT_MAP: Record<string, ApplicantType['value']> = {
  individuals: 'individual',
  individual: 'individual',
};

export function mapApplicantTypes(values: string[]): ApplicantType[] {
  return values.map((label) => {
    const mapped = APPLICANT_MAP[label.toLowerCase()];
    return mapped
      ? { value: mapped, customValue: null, description: null }
      : { value: 'custom', customValue: label, description: null };
  });
}

export function parseMdContact(
  grant: Pick<MdGrant, 'contact_name' | 'contact_email' | 'contact_phone'>,
) {
  const name = nullIfEmpty(grant.contact_name);
  const email = nullIfEmpty(grant.contact_email);
  const phone = nullIfEmpty(grant.contact_phone);
  return name || email || phone ? { name, email, phone, description: null } : null;
}

function putString(fields: Record<string, CustomField>, name: string, value: string | null) {
  if (value) fields[name] = { name, fieldType: 'string', value };
}

function putList(fields: Record<string, CustomField>, name: string, values: string[]) {
  if (values.length) fields[name] = { name, fieldType: 'array', value: values };
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function singleDate(name: string, date: string, details?: string | null) {
  return { name, eventType: 'singleDate' as const, date, time: null, details: details ?? null };
}

export function mdGrantToOpportunity(grant: MdGrant, syncedAt: string): MdOpportunityInput {
  const fields: Record<string, CustomField> = {};
  const agency = nullIfEmpty(grant.agency);
  if (agency) {
    fields.agency = {
      name: 'agency',
      fieldType: 'object',
      value: { code: null, name: agency, parentName: null, parentCode: null },
    };
  }
  const contact = parseMdContact(grant);
  if (contact) fields.contactInfo = { name: 'contactInfo', fieldType: 'object', value: contact };
  fields.additionalInfo = {
    name: 'additionalInfo',
    fieldType: 'object',
    value: {
      url: `${COMPASS_BASE}#/incentive/${grant.slug}`,
      description: 'Maryland Community Compass record',
    },
  };

  const eligibilityDetails = [grant.program_audience, grant.geographic_eligibility]
    .map(nullIfEmpty)
    .filter((value): value is string => value !== null)
    .join('\n\n');
  if (grant.eligible_organization_types.length || eligibilityDetails) {
    fields.eligibilityCriteria = {
      name: 'eligibilityCriteria',
      fieldType: 'object',
      value: {
        beneficiaryTypes: grant.eligible_organization_types.map((name) => ({
          code: name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, ''),
          name,
        })),
        details: eligibilityDetails || null,
      },
    };
  }
  const attachments = grant.attachment_urls
    .filter((url) => nullIfNotUrl(url))
    .map((downloadUrl) => ({
      downloadUrl,
      name: attachmentName(downloadUrl),
      mimeType: null,
    }));
  if (attachments.length)
    fields.attachments = { name: 'attachments', fieldType: 'array', value: attachments };

  putString(fields, 'fundingSource', 'Public');
  putString(fields, 'fundingInstrument', grant.assistance_type.join('; ') || 'Grant');
  fields.lastSyncedAt = { name: 'lastSyncedAt', fieldType: 'string', value: syncedAt };
  fields.mdCompassId = { name: 'mdCompassId', fieldType: 'number', value: grant.id };
  putString(fields, 'mdSlug', grant.slug);
  putString(fields, 'mdDataQuality', nullIfEmpty(grant.data_quality));
  putString(fields, 'mdGeographicScope', nullIfEmpty(grant.geographic_scope));
  fields.mdAcceptingApplications = {
    name: 'mdAcceptingApplications',
    fieldType: 'boolean',
    value: grant.is_accepting_applications,
  };
  fields.mdRecurring = { name: 'mdRecurring', fieldType: 'boolean', value: grant.is_recurring };
  putList(fields, 'mdAssistanceTypes', grant.assistance_type);
  putList(fields, 'mdEligibleIndustries', grant.eligible_industries);
  putList(fields, 'mdEligibleCounties', grant.eligible_counties);
  putList(fields, 'mdEligibleMunicipalities', grant.eligible_municipalities);
  putList(fields, 'mdEligibleRegions', grant.eligible_regions);
  putList(fields, 'mdEligibleIncentiveAreas', grant.eligible_incentive_areas);
  putList(fields, 'mdEligibleOrganizationTypes', grant.eligible_organization_types);
  putString(fields, 'mdBusinessStage', nullIfEmpty(grant.business_stage));
  putString(fields, 'mdApplicationDeadlineRaw', nullIfEmpty(grant.application_deadline_string));
  putString(fields, 'mdApplicationProcess', nullIfEmpty(grant.application_process_overview));
  putString(fields, 'mdProgramAudience', nullIfEmpty(grant.program_audience));
  putString(fields, 'mdUseOfFunds', nullIfEmpty(grant.use_of_funds));
  putString(fields, 'mdGeographicEligibility', nullIfEmpty(grant.geographic_eligibility));
  putList(fields, 'mdRequirements', grant.requirements_list);
  putList(fields, 'mdSourceUrls', grant.source_urls);
  fields.mdSourceCount = { name: 'mdSourceCount', fieldType: 'number', value: grant.source_count };

  const fundingText = nullIfEmpty(grant.assistance_description);
  const range = parseAmountRange(fundingText);
  const deadline = nullIfEmpty(grant.application_deadline_date);
  const status = normalizeStatus(grant);

  return {
    id: slugToCgId(grant.slug),
    title: grant.program_name,
    description: stripHtml(nullIfEmpty(grant.program_description)) ?? '',
    status: { ...status, description: null },
    source: nullIfNotUrl(nullIfEmpty(grant.URL)),
    funding:
      fundingText || range.min || range.max
        ? {
            details: fundingText,
            totalAmountAvailable: null,
            minAwardAmount: range.min,
            maxAwardAmount: range.max,
            minAwardCount: null,
            maxAwardCount: null,
            estimatedAwardCount: null,
          }
        : null,
    keyDates: deadline
      ? {
          postDate: null,
          closeDate: singleDate(
            'Application deadline',
            deadline,
            nullIfEmpty(grant.application_deadline_string),
          ),
          otherDates: null,
        }
      : null,
    acceptedApplicantTypes: grant.eligible_organization_types.length
      ? mapApplicantTypes(grant.eligible_organization_types)
      : null,
    customFields: fields,
    createdAt: toIso(grant.created_at),
    lastModifiedAt: toIso(grant.updated_at),
  };
}

function attachmentName(downloadUrl: string): string {
  const raw = new URL(downloadUrl).pathname.split('/').pop() || 'Attachment';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function cfValue(opp: MdOpportunityInput, name: string): unknown {
  return opp.customFields?.[name]?.value;
}

function cfString(opp: MdOpportunityInput, name: string): string {
  const value = cfValue(opp, name);
  return typeof value === 'string' ? value : '';
}

function cfList(opp: MdOpportunityInput, name: string): string[] {
  const value = cfValue(opp, name);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isoValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date(0).toISOString();
}

/** Best-effort reverse transform required by the SDK's plugin contract. */
export function mdOpportunityToGrant(opp: MdOpportunityInput): MdGrant {
  const agency = cfValue(opp, 'agency') as { name?: unknown } | undefined;
  const contact = cfValue(opp, 'contactInfo') as
    | { name?: unknown; email?: unknown; phone?: unknown }
    | undefined;
  const attachments = cfValue(opp, 'attachments');
  const closeDate = opp.keyDates?.closeDate;
  const rawClose = closeDate && 'date' in closeDate ? closeDate.date : '';
  const close =
    rawClose instanceof Date
      ? rawClose.toISOString().slice(0, 10)
      : typeof rawClose === 'string'
        ? rawClose
        : '';
  return {
    id:
      typeof cfValue(opp, 'mdCompassId') === 'number' ? (cfValue(opp, 'mdCompassId') as number) : 0,
    slug: cfString(opp, 'mdSlug'),
    program_name: opp.title,
    agency: typeof agency?.name === 'string' ? agency.name : '',
    URL: typeof opp.source === 'string' ? opp.source : '',
    program_description: opp.description,
    is_accepting_applications: cfValue(opp, 'mdAcceptingApplications') === true,
    is_recurring: cfValue(opp, 'mdRecurring') === true,
    data_quality: cfString(opp, 'mdDataQuality'),
    funding_source: cfString(opp, 'fundingSource').toLowerCase(),
    geographic_scope: cfString(opp, 'mdGeographicScope'),
    assistance_type: cfList(opp, 'mdAssistanceTypes'),
    assistance_description: opp.funding?.details ?? '',
    eligible_industries: cfList(opp, 'mdEligibleIndustries'),
    eligible_counties: cfList(opp, 'mdEligibleCounties'),
    eligible_municipalities: cfList(opp, 'mdEligibleMunicipalities'),
    eligible_regions: cfList(opp, 'mdEligibleRegions'),
    eligible_incentive_areas: cfList(opp, 'mdEligibleIncentiveAreas'),
    eligible_organization_types: cfList(opp, 'mdEligibleOrganizationTypes'),
    business_stage: cfString(opp, 'mdBusinessStage'),
    application_deadline_string: cfString(opp, 'mdApplicationDeadlineRaw'),
    application_deadline_date: close,
    application_process_overview: cfString(opp, 'mdApplicationProcess'),
    program_audience: cfString(opp, 'mdProgramAudience'),
    use_of_funds: cfString(opp, 'mdUseOfFunds'),
    geographic_eligibility: cfString(opp, 'mdGeographicEligibility'),
    requirements_list: cfList(opp, 'mdRequirements'),
    contact_name: typeof contact?.name === 'string' ? contact.name : '',
    contact_email: typeof contact?.email === 'string' ? contact.email : '',
    contact_phone: typeof contact?.phone === 'string' ? contact.phone : '',
    source_count:
      typeof cfValue(opp, 'mdSourceCount') === 'number'
        ? (cfValue(opp, 'mdSourceCount') as number)
        : 0,
    source_urls: cfList(opp, 'mdSourceUrls'),
    attachment_urls: Array.isArray(attachments)
      ? attachments
          .map((item) => (item as { downloadUrl?: unknown }).downloadUrl)
          .filter((url): url is string => typeof url === 'string')
      : [],
    created_at: isoValue(opp.createdAt),
    updated_at: isoValue(opp.lastModifiedAt),
  };
}

export function buildSearchText(grant: MdGrant): string {
  return [
    grant.program_name,
    grant.agency,
    stripHtml(grant.program_description),
    grant.assistance_description,
    grant.program_audience,
    grant.use_of_funds,
    grant.geographic_eligibility,
    ...grant.requirements_list,
    ...grant.eligible_industries,
    ...grant.eligible_counties,
    ...grant.eligible_organization_types,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

// Scaffold-era compatibility helpers. Compass dates are already ISO values.
export const mdDateToIso = (value: string | null): string => (value ? toIso(value) : '');
export const splitMdDateTime = (value: string | null) => {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/);
  return match ? { date: match[1] as string, time: match[2] ?? null } : null;
};
export const parseMatchingFunds = (_value: string | null) => null;
