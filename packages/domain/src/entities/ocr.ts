import { z } from 'zod'

export const ocrResultSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  language: z.string(),
  pages: z.number().int().min(1),
  engineVersion: z.string().nullable(),
})
export type OCRResult = z.infer<typeof ocrResultSchema>

export const ocrHealthSchema = z.object({
  ok: z.boolean(),
  engine: z.string(),
  error: z.string().nullable(),
})
export type OCRHealth = z.infer<typeof ocrHealthSchema>
