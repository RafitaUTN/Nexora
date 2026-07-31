import type { AIProvider, ProviderConfig, ProviderId } from '@documind/domain'
import { defaultModels } from '@documind/domain'
import { OpenRouterProvider } from './providers/openrouter'
import { OpenAiProvider } from './providers/openai'
import { GeminiProvider } from './providers/gemini'
import { ClaudeProvider } from './providers/claude'
import { OllamaProvider } from './providers/ollama'

/**
 * Factoría de proveedores de IA (Strategy + Factory). Para agregar un
 * proveedor: implementar AIProvider y registrarlo aquí.
 */
export function createAIProvider(id: ProviderId, apiKey: string, overrides?: Partial<ProviderConfig>): AIProvider {
  const config: ProviderConfig = {
    id,
    apiKey,
    baseUrl: '',
    defaultModel: defaultModels[id],
    ...overrides,
  }
  switch (id) {
    case 'openrouter':
      return new OpenRouterProvider(config)
    case 'openai':
      return new OpenAiProvider(config)
    case 'gemini':
      return new GeminiProvider(config)
    case 'claude':
      return new ClaudeProvider(config)
    case 'ollama':
      return new OllamaProvider(config)
  }
}
