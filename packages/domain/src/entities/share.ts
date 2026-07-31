import { z } from 'zod'

/**
 * Entidades de compartición multiusuario (Post-MVP).
 *
 * Un `Share` representa una invitación a un usuario remoto (por correo) para
 * acceder a la biblioteca de documentos del usuario que comparte. El rol
 * determina los permisos (`viewer` = solo lectura, `editor` = puede editar).
 * El ciclo de vida es `invited` → `active` → `revoked`.
 */

export const shareRoleSchema = z.enum(['viewer', 'editor'])
export type ShareRole = z.infer<typeof shareRoleSchema>

export const shareStatusSchema = z.enum(['invited', 'active', 'revoked'])
export type ShareStatus = z.infer<typeof shareStatusSchema>

export const shareSchema = z.object({
  id: z.number(),
  /** Clave canónica (UUID) usada por la sincronización entre dispositivos. */
  uid: z.string().min(1),
  /** Correo del usuario propietario de la biblioteca que comparte. */
  ownerEmail: z.string(),
  /** Correo del usuario invitado. */
  memberEmail: z.string(),
  role: shareRoleSchema,
  status: shareStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Share = z.infer<typeof shareSchema>

export const newShareSchema = z.object({
  memberEmail: z.string().trim().email().toLowerCase(),
  role: shareRoleSchema.default('viewer'),
})
export type NewShare = z.infer<typeof newShareSchema>

export type ShareErrorCode =
  | 'ERR_SHARE'
  | 'ERR_SHARE_INVALID_EMAIL'
  | 'ERR_SHARE_SELF'
  | 'ERR_SHARE_DUPLICATE'
  | 'ERR_SHARE_NOT_FOUND'
  | 'ERR_SHARE_FORBIDDEN'

/** Error tipado del servicio de compartición. */
export class ShareError extends Error {
  constructor(
    message: string,
    readonly code: ShareErrorCode,
  ) {
    super(message)
    this.name = 'ShareError'
  }
}
