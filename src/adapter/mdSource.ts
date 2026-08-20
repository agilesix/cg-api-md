import { z } from 'zod';

const nullableString = z
  .string()
  .nullable()
  .transform((value) => value ?? '');
const stringList = z
  .array(z.string())
  .nullable()
  .optional()
  .transform((value) => value ?? []);
const nullableBoolean = z
  .boolean()
  .nullable()
  .transform((value) => value ?? false);
const nullableNonnegativeInt = z
  .number()
  .int()
  .nonnegative()
  .nullable()
  .optional()
  .transform((value) => value ?? 0);

/** Summary returned by the paginated Compass incentives collection. */
export const MdGrantSummarySchema = z
  .object({
    slug: z.string().min(1),
    program_name: z.string(),
    agency: nullableString,
    URL: nullableString,
    is_accepting_applications: nullableBoolean,
    is_recurring: nullableBoolean,
    data_quality: nullableString,
    funding_source: nullableString,
    geographic_scope: nullableString,
    assistance_type: stringList,
    eligible_industries: stringList,
    eligible_counties: stringList,
    eligible_incentive_areas: stringList,
    eligible_organization_types: stringList,
    application_deadline_string: nullableString,
    application_deadline_date: nullableString,
    program_description: nullableString,
  })
  .passthrough();

/** Full record returned by `GET /api/v1/incentives/{slug}/`. */
export const MdGrantSchema = MdGrantSummarySchema.extend({
  id: z.number().int(),
  assistance_description: nullableString,
  eligible_municipalities: stringList,
  eligible_regions: stringList,
  business_stage: nullableString,
  application_process_overview: nullableString,
  program_audience: nullableString,
  use_of_funds: nullableString,
  geographic_eligibility: nullableString,
  requirements_list: stringList,
  contact_name: nullableString,
  contact_email: nullableString,
  contact_phone: nullableString,
  source_count: nullableNonnegativeInt,
  source_urls: stringList,
  attachment_urls: stringList,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
}).passthrough();

export const MdGrantListResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().url().nullable(),
  previous: z.string().url().nullable(),
  results: z.array(MdGrantSummarySchema),
});

export type MdGrant = z.infer<typeof MdGrantSchema>;
export type MdGrantSummary = z.infer<typeof MdGrantSummarySchema>;
export type MdGrantListResponse = z.infer<typeof MdGrantListResponseSchema>;
