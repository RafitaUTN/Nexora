import { z } from 'zod'

export const documentStatusSchema = z.enum([
  'pending',
  'extracting',
  'ocr',
  'pending_ocr',
  'ai',
  'indexed',
  'ready',
  'error',
])
export type DocumentStatus = z.infer<typeof documentStatusSchema>

export const documentSchema = z.object({
  id: z.number(),
  sourceId: z.number().nullable(),
  path: z.string(),
  filename: z.string(),
  ext: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number(),
  hashSha256: z.string(),
  status: documentStatusSchema,
  title: z.string().nullable(),
  contentPreview: z.string().nullable(),
  ocrConfidence: z.number().nullable(),
  language: z.string().nullable(),
  version: z.number(),
  isDuplicateOf: z.number().nullable(),
  fileMtimeMs: z.number().nullable(),
  addedAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
})
export type Document = z.infer<typeof documentSchema>

export const newDocumentSchema = z.object({
  sourceId: z.number().nullable(),
  path: z.string().min(1),
  filename: z.string().min(1),
  ext: z.string().min(1),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
  fileMtimeMs: z.number().nullable(),
})
export type NewDocument = z.infer<typeof newDocumentSchema>

export const documentSummarySchema = documentSchema.pick({
  id: true,
  sourceId: true,
  path: true,
  filename: true,
  ext: true,
  sizeBytes: true,
  status: true,
  title: true,
  ocrConfidence: true,
  language: true,
  isDuplicateOf: true,
  addedAt: true,
  updatedAt: true,
})
export type DocumentSummary = z.infer<typeof documentSummarySchema>

export const documentFilterSchema = z.object({
  query: z.string().optional(),
  status: documentStatusSchema.optional(),
  tagId: z.number().optional(),
  ext: z.string().optional(),
  isDuplicate: z.boolean().optional(),
  cursor: z.number().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  sort: z.enum(['addedAt', 'updatedAt', 'filename', 'sizeBytes']).default('addedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
})
export type DocumentFilter = z.infer<typeof documentFilterSchema>

export const documentStatsSchema = z.object({
  total: z.number(),
  indexed: z.number(),
  pending: z.number(),
  duplicates: z.number(),
  errors: z.number(),
  totalSizeBytes: z.number(),
  byExt: z.record(z.string(), z.number()),
})
export type DocumentStats = z.infer<typeof documentStatsSchema>

export interface PagedResult<T> {
  items: T[]
  nextCursor: number | null
  hasMore: boolean
}

export function paged<T extends { id: number }>(items: T[], limit: number): PagedResult<T> {
  const hasMore = items.length > limit
  const page = hasMore ? items.slice(0, limit) : items
  const last = page[page.length - 1]
  return { items: page, nextCursor: last ? last.id : null, hasMore }
}
