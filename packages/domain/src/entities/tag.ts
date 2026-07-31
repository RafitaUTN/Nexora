import { z } from 'zod'

export const tagSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(60),
  color: z.string().nullable(),
  createdAt: z.string(),
})
export type Tag = z.infer<typeof tagSchema>

export const newTagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
})
export type NewTag = z.infer<typeof newTagSchema>

export const tagStatsSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string().nullable(),
  count: z.number(),
})
export type TagStats = z.infer<typeof tagStatsSchema>
