import { z } from 'zod';
import {
  definePlugin,
  type FromCommon,
  type ToCommon,
  type TransformResult,
} from '@common-grants/sdk/extensions';
import {
  AdditionalInfoValueSchema,
  AgencyValueSchema,
  AttachmentListValueSchema,
  ContactInfoValueSchema,
  EligibilityCriteriaValueSchema,
  MdStringListSchema,
} from './fields';
import { MdGrantSchema, type MdGrant } from './mdSource';
import { mdGrantToOpportunity, mdOpportunityToGrant } from './transform';

const stringField = (description: string) => ({ fieldType: 'string' as const, description });
const listField = (description: string) => ({
  fieldType: 'array' as const,
  value: MdStringListSchema,
  description,
});

const mdCustomFields = {
  agency: {
    fieldType: 'object',
    value: AgencyValueSchema,
    description: 'Agency offering the opportunity',
  },
  contactInfo: {
    fieldType: 'object',
    value: ContactInfoValueSchema,
    description: 'Program contact information',
  },
  additionalInfo: {
    fieldType: 'object',
    value: AdditionalInfoValueSchema,
    description: 'Maryland Compass record URL',
  },
  eligibilityCriteria: {
    fieldType: 'object',
    value: EligibilityCriteriaValueSchema,
    description: 'Source eligibility categories and details',
  },
  attachments: {
    fieldType: 'array',
    value: AttachmentListValueSchema,
    description: 'Source documents linked by Maryland Compass',
  },
  fundingSource: stringField('Where the funding originates'),
  fundingInstrument: stringField('Funding instrument type'),
  lastSyncedAt: {
    fieldType: 'string',
    value: z.string().datetime(),
    description: 'ISO 8601 datetime when this record was ingested',
  },
  mdCompassId: { fieldType: 'number', description: 'Compass database record id' },
  mdSlug: stringField('Stable Compass incentive slug'),
  mdDataQuality: stringField('Compass data-quality assessment'),
  mdGeographicScope: stringField('Compass geographic scope'),
  mdAcceptingApplications: { fieldType: 'boolean', description: 'Whether applications are open' },
  mdRecurring: { fieldType: 'boolean', description: 'Whether the program recurs' },
  mdAssistanceTypes: listField('Compass assistance types'),
  mdEligibleIndustries: listField('Eligible industry labels'),
  mdEligibleCounties: listField('Eligible Maryland counties'),
  mdEligibleMunicipalities: listField('Eligible Maryland municipalities'),
  mdEligibleRegions: listField('Eligible Maryland regions'),
  mdEligibleIncentiveAreas: listField('Eligible incentive areas'),
  mdEligibleOrganizationTypes: listField('Original eligible organization types'),
  mdBusinessStage: stringField('Eligible business stage'),
  mdApplicationDeadlineRaw: stringField('Original deadline text'),
  mdApplicationProcess: stringField('Application process overview'),
  mdProgramAudience: stringField('Intended program audience'),
  mdUseOfFunds: stringField('Permitted uses of funds'),
  mdGeographicEligibility: stringField('Geographic eligibility details'),
  mdRequirements: listField('Application and program requirements'),
  mdSourceUrls: listField('URLs consulted by Compass'),
  mdSourceCount: { fieldType: 'number', description: 'Number of source pages consulted' },
} as const;

type MdTransform = {
  model: 'Opportunity';
  sourceSchema: typeof MdGrantSchema;
  customFields: typeof mdCustomFields;
};

const toCommon: ToCommon<MdTransform> = (source) =>
  ({
    result: mdGrantToOpportunity(source, new Date().toISOString()) as unknown as MdOpportunity,
    errors: [],
  }) satisfies TransformResult<MdOpportunity>;

const fromCommon: FromCommon<MdTransform> = (common) =>
  ({
    result: mdOpportunityToGrant(common as unknown as MdOpportunityInput),
    errors: [],
  }) satisfies TransformResult<MdGrant>;

export const MdPlugin = definePlugin({
  meta: {
    name: 'md-compass',
    version: '0.1.0',
    sourceSystem: 'maryland-community-compass',
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

export const MdOpportunitySchema = MdPlugin.schemas.Opportunity.commonSchema;
export type MdOpportunity = z.infer<typeof MdOpportunitySchema>;
export type MdOpportunityInput = z.input<typeof MdOpportunitySchema>;
