import { z } from 'zod'

export const sourceKindSchema = z.enum(['folder', 'file'])
export const scanModeSchema = z.enum(['recursive', 'flat'])

export const sourceSchema = z.object({
  id: z.number(),
  path: z.string().min(1),
  name: z.string().min(1),
  kind: sourceKindSchema,
  scanMode: scanModeSchema,
  enabled: z.boolean(),
  lastScanAt: z.string().nullable(),
  createdAt: z.string(),
})
export type DocumentSource = z.infer<typeof sourceSchema>

export const newSourceSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  kind: sourceKindSchema.default('folder'),
  scanMode: scanModeSchema.default('recursive'),
  enabled: z.boolean().default(true),
})
export type NewSource = z.infer<typeof newSourceSchema>
