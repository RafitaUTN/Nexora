import { z } from 'zod'
import type { ProviderId } from '../entities/settings'

export const aiTaskSchema = z.enum([
  'classify',
  'summarize',
  'extract-entities',
  'suggest-tags',
  'qa',
  'semantic-search',
])
export type AiTask = z.infer<typeof aiTaskSchema>

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const chatRequestSchema = z.object({
  messages: z.array(
    z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() }),
  ),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  responseFormat: z.enum(['text', 'json']).optional(),
})
export type ChatRequest = z.infer<typeof chatRequestSchema>

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cached: boolean
}

export interface ChatResponse {
  content: string
  usage: TokenUsage
  model: string
}

export interface ProviderHealth {
  ok: boolean
  latencyMs: number
  error?: string
}

export interface ProviderConfig {
  id: ProviderId
  apiKey: string
  baseUrl: string
  defaultModel: string
}

export const defaultModels: Record<ProviderId, string> = {
  openrouter: 'openai/gpt-4o-mini',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  claude: 'claude-3-5-sonnet',
  ollama: 'llama3.2',
}
