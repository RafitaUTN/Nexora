import { z } from 'zod'

export const historyActionSchema = z.enum([
  'created',
  'updated',
  'moved',
  'renamed',
  'tagged',
  'classified',
  'restored',
  'deleted',
])
export type HistoryAction = z.infer<typeof historyActionSchema>

export const historyEntrySchema = z.object({
  id: z.number(),
  documentId: z.number().nullable(),
  action: historyActionSchema,
  detail: z.string().nullable(),
  actor: z.string(),
  createdAt: z.string(),
})
export type HistoryEntry = z.infer<typeof historyEntrySchema>

export const newHistoryEntrySchema = z.object({
  documentId: z.number().nullable(),
  action: historyActionSchema,
  detail: z.string().nullable().optional(),
  actor: z.string().optional(),
})
export type NewHistoryEntry = z.infer<typeof newHistoryEntrySchema>

export const auditEntrySchema = z.object({
  id: z.number(),
  actor: z.string(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  detail: z.string().nullable(),
  createdAt: z.string(),
})
export type AuditEntry = z.infer<typeof auditEntrySchema>

export const newAuditEntrySchema = z.object({
  actor: z.string().optional(),
  action: z.string().min(1),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
})
export type NewAuditEntry = z.infer<typeof newAuditEntrySchema>
