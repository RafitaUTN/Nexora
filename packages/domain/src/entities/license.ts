import { z } from 'zod'

export const licenseTierSchema = z.enum(['free', 'pro', 'enterprise'])
export type LicenseTier = z.infer<typeof licenseTierSchema>

export const licenseStatusSchema = z.enum(['active', 'expired', 'revoked'])
export type LicenseStatus = z.infer<typeof licenseStatusSchema>

export const licenseSchema = z.object({
  tier: licenseTierSchema,
  status: licenseStatusSchema,
  activatedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  deviceId: z.string().nullable(),
  keySha256: z.string().nullable(),
  maxDevices: z.number().int().min(1).nullable(),
  signature: z.string().nullable(),
})
export type License = z.infer<typeof licenseSchema>

/**
 * Carga firmada por el servidor de licencias con Ed25519. La clave privada
 * vive únicamente en el servidor; la aplicación solo conserva la clave pública
 * para verificar la firma sin conexión. `expiresAt` vacío significa licencia perpetua.
 */
export interface LicensePayload {
  keySha256: string
  tier: LicenseTier
  deviceId: string
  activatedAt: string
  expiresAt: string
  maxDevices: number
}

export const licenseKeySchema = z
  .string()
  .trim()
  .min(10, 'La clave de licencia no es válida')
  .max(128, 'La clave de licencia no es válida')
  .regex(/^[A-Za-z0-9-]+$/, 'La clave de licencia no es válida')
export type LicenseKey = z.infer<typeof licenseKeySchema>

export const TIER_RANK: Record<LicenseTier, number> = { free: 0, pro: 1, enterprise: 2 }

/** Licencia por defecto (sin activar). */
export const freeLicense = (): License => ({
  tier: 'free',
  status: 'active',
  activatedAt: null,
  expiresAt: null,
  deviceId: null,
  keySha256: null,
  maxDevices: null,
  signature: null,
})
