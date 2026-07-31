import type { ProviderId } from '@documind/domain'

const BLOCKED = [
  'embedding',
  'embed',
  'rerank',
  'whisper',
  'tts',
  'speech',
  'audio',
  'moderation',
  'dall-e',
  'dalle',
  'image',
  'video',
  'realtime',
]

const PREFERRED: Record<ProviderId, readonly string[]> = {
  openrouter: [
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3.7-sonnet',
    'google/gemini-2.0-flash',
    'google/gemini-1.5-flash',
    'meta-llama/llama-3.3',
    'meta-llama/llama-3.1',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.5-pro'],
  claude: ['claude-3-5-sonnet', 'claude-3-7-sonnet', 'claude-3-5-haiku', 'claude-sonnet-4'],
  ollama: ['llama3.2', 'llama3.1', 'llama3', 'qwen2.5', 'mistral', 'gemma2', 'gemma'],
}

/**
 * Elige un modelo razonable para conversación a partir de la lista devuelta
 * por el proveedor: descarta modelos que no son de chat y prioriza modelos
 * conocidos y de uso general; si no hay coincidencia, usa el primero.
 */
export function selectBestModel(provider: ProviderId, models: readonly string[]): string | null {
  const candidates = models.filter((model) => !BLOCKED.some((blocked) => model.includes(blocked)))
  if (candidates.length === 0) return null
  for (const preferred of PREFERRED[provider]) {
    const match = candidates.find((model) => model.includes(preferred))
    if (match) return match
  }
  return candidates[0] ?? null
}
