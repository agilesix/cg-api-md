import { z } from 'zod';

export const AgencyValueSchema = z.object({
  code: z.string().nullish(),
  name: z.string().nullish(),
  parentName: z.string().nullish(),
  parentCode: z.string().nullish(),
});

export const ContactInfoValueSchema = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  description: z.string().nullish(),
});

export const AdditionalInfoValueSchema = z.object({
  url: z.string().nullish(),
  description: z.string().nullish(),
});

export const EligibilityCriteriaValueSchema = z.object({
  beneficiaryTypes: z.array(z.object({ code: z.string(), name: z.string() })),
  details: z.string().nullish(),
});

export const AttachmentListValueSchema = z.array(
  z.object({
    downloadUrl: z.string().url(),
    name: z.string(),
    mimeType: z.string().nullish(),
  }),
);

export const MdStringListSchema = z.array(z.string());
