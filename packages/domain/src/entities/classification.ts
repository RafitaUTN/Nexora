import { z } from 'zod'

export const entityKindSchema = z.enum(['person', 'org', 'email', 'invoice', 'amount', 'date', 'iban'])
export type EntityKind = z.infer<typeof entityKindSchema>

export const extractedEntitySchema = z.object({
  kind: entityKindSchema,
  value: z.string().min(1),
  confidence: z.number().min(0).max(1),
})
export type ExtractedEntity = z.infer<typeof extractedEntitySchema>

export const classificationSchema = z.object({
  documentId: z.number(),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  provider: z.string(),
  model: z.string(),
  cached: z.boolean(),
  createdAt: z.string(),
})
export type Classification = z.infer<typeof classificationSchema>
