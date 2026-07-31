import { z } from 'zod'

export const licenseTierSchema = z.enum(['free', 'pro', 'enterprise'])
export type LicenseTier = z.infer<typeof licenseTierSchema>

export const licenseSchema = z.object({
  tier: licenseTierSchema,
  status: z.enum(['active', 'expired', 'revoked']),
  activatedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
})
export type License = z.infer<typeof licenseSchema>
