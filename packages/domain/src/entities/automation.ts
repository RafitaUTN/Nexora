import { z } from 'zod'

export const automationTriggerSchema = z.enum([
  'document:indexed',
  'document:classified',
  'schedule:daily',
  'schedule:weekly',
])
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>

export const automationActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    targetDir: z.string().min(1),
    createSubdirByExt: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('rename'),
    pattern: z.string().min(1),
  }),
  z.object({
    type: z.literal('tag'),
    tagNames: z.array(z.string().min(1)).min(1),
  }),
  z.object({ type: z.literal('classify') }),
])
export type AutomationAction = z.infer<typeof automationActionSchema>

export const automationSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
  triggerType: automationTriggerSchema,
  action: automationActionSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Automation = z.infer<typeof automationSchema>

export const newAutomationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  triggerType: automationTriggerSchema,
  action: automationActionSchema,
})
export type NewAutomation = z.infer<typeof newAutomationSchema>
