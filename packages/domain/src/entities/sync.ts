import { z } from 'zod'

/**
 * Entidades de sincronización DocuMind.
 *
 * Estrategia LWW (last-write-wins): cada cambio lleva un `updatedAtMs`
 * monotónico; al aplicar un cambio remoto se descarta si el estado local
 * es más reciente (y viceversa). Los borrados se propagan como tombstones
 * (`deletedAtMs`), nunca como DELETE real, para que cualquier dispositivo
 * pueda detectar la eliminación.
 */

export const syncEntitySchema = z.enum(['document', 'tag', 'assignment'])
export type SyncEntity = z.infer<typeof syncEntitySchema>

export const syncOperationSchema = z.enum(['upsert', 'delete'])
export type SyncOperation = z.infer<typeof syncOperationSchema>

/** Cambio local pendiente (outbox) o cambio remoto recibido. */
export const syncChangeSchema = z.object({
  entity: syncEntitySchema,
  entityKey: z.string().min(1),
  op: syncOperationSchema,
  updatedAtMs: z.number().int(),
  deviceId: z.string(),
  document: z
    .object({
      localId: z.number(),
      filename: z.string(),
      ext: z.string(),
      mimeType: z.string().nullable(),
      sizeBytes: z.number(),
      hashSha256: z.string(),
      status: z.string(),
      title: z.string().nullable(),
      contentPreview: z.string().nullable(),
      ocrConfidence: z.number().nullable(),
      language: z.string().nullable(),
      version: z.number(),
      addedAt: z.string().nullable(),
      content: z.string().nullable(),
      contentHash: z.string().nullable(),
    })
    .optional(),
  tag: z
    .object({
      localId: z.number(),
      name: z.string(),
      color: z.string().nullable(),
      createdAt: z.string().nullable(),
    })
    .optional(),
  assignment: z
    .object({
      documentId: z.number(),
      tagId: z.number(),
    })
    .optional(),
})
export type SyncChange = z.infer<typeof syncChangeSchema>

/** Configuración persistida de sincronización. */
export const syncSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  url: z.string().default(''),
  /** Clave publicable de Supabase (segura para clientes; RLS protege los datos). */
  anonKey: z.string().default(''),
  lastPullMs: z.number().int().default(0),
})
export type SyncSettings = z.infer<typeof syncSettingsSchema>

export const syncStatusSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  url: z.string(),
  anonKeySet: z.boolean(),
  deviceId: z.string(),
  pending: z.number(),
  lastPullMs: z.number(),
})
export type SyncStatus = z.infer<typeof syncStatusSchema>

export const syncResultSchema = z.object({
  pushed: z.number(),
  pulled: z.number(),
  applied: z.number(),
  skipped: z.number(),
})
export type SyncResult = z.infer<typeof syncResultSchema>

export type SyncErrorCode =
  | 'ERR_SYNC'
  | 'ERR_SYNC_NOT_CONFIGURED'
  | 'ERR_SYNC_DISABLED'
  | 'ERR_SYNC_NETWORK'
  | 'ERR_SYNC_REMOTE'

/** Error tipado del servicio de sincronización. */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly code: SyncErrorCode,
  ) {
    super(message)
    this.name = 'SyncError'
  }
}
