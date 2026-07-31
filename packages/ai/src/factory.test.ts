import { describe, expect, it } from 'vitest'
import { createAIProvider } from './factory'
import { OpenRouterProvider } from './providers/openrouter'
import { OpenAiProvider } from './providers/openai'
import { GeminiProvider } from './providers/gemini'
import { ClaudeProvider } from './providers/claude'
import { OllamaProvider } from './providers/ollama'
import { defaultModels } from '@documind/domain'

describe('createAIProvider', () => {
  it.each([
    ['openrouter', OpenRouterProvider],
    ['openai', OpenAiProvider],
    ['gemini', GeminiProvider],
    ['claude', ClaudeProvider],
    ['ollama', OllamaProvider],
  ] as const)('crea %s', (id, Klass) => {
    const provider = createAIProvider(id, 'key')
    expect(provider).toBeInstanceOf(Klass)
    expect(provider.id).toBe(id)
  })

  it('aplica el modelo por defecto de cada proveedor', () => {
    for (const id of ['openrouter', 'openai', 'gemini', 'claude', 'ollama'] as const) {
      const provider = createAIProvider(id, 'key')
      expect(provider).toBeDefined()
    }
    expect(defaultModels.ollama).toBe('llama3.2')
  })
})
