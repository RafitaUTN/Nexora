import { z } from 'zod'

export const providerIdSchema = z.enum(['openrouter', 'openai', 'gemini', 'claude', 'ollama'])
export type ProviderId = z.infer<typeof providerIdSchema>

export const aiSettingsSchema = z.object({
  provider: providerIdSchema.nullable().default(null),
  model: z.string().default(''),
  tokenBudget: z.number().int().min(256).max(64_000).default(8_000),
  sendWholeDocument: z.boolean().default(false),
  maxCacheAgeDays: z.number().int().min(1).max(365).default(30),
  requestsPerMinute: z.number().int().min(1).max(600).default(30),
})
export type AiSettings = z.infer<typeof aiSettingsSchema>

export const updateSettingsSchema = z.object({
  autoCheck: z.boolean().default(true),
  autoDownload: z.boolean().default(true),
  channel: z.enum(['stable', 'beta']).default('stable'),
  checkIntervalHours: z.number().int().min(1).max(168).default(4),
})
export type UpdateSettings = z.infer<typeof updateSettingsSchema>

export const appSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  language: z.enum(['es', 'en']).default('es'),
  ocrLanguages: z.array(z.string().min(2)).default(['spa', 'eng']),
  ocrMaxDpi: z.number().int().min(72).max(600).default(300),
  ai: aiSettingsSchema,
  updates: updateSettingsSchema,
  telemetry: z.boolean().default(false),
})
export type AppSettings = z.infer<typeof appSettingsSchema>

export const defaultSettings = (): AppSettings =>
  appSettingsSchema.parse({
    ai: {},
    updates: {},
  })
