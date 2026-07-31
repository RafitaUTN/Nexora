import type {
  ChatRequest,
  ChatResponse,
  ProviderConfig,
  ProviderHealth,
} from '@documind/domain'
import type { AIProvider } from '@documind/domain'
import { jsonRequest } from './http-client'

interface ClaudeResponse {
  content?: { text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { message?: string }
}

/**
 * Adaptador Anthropic Claude (Messages API).
 */
export class ClaudeProvider implements AIProvider {
  readonly id = 'claude' as const
  private readonly baseUrl: string
  private readonly model: string

  constructor(private readonly config: ProviderConfig) {
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1'
    this.model = config.defaultModel
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const system = req.messages.find((m) => m.role === 'system')?.content
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))

    const data = (await jsonRequest('/messages', {
      baseUrl: this.baseUrl,
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: req.model ?? this.model,
        messages,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.1,
        ...(system ? { system } : {}),
      },
    })) as ClaudeResponse

    if (data.error?.message) throw new Error(data.error.message)
    const content = data.content?.[0]?.text ?? ''
    if (!content) throw new Error('Respuesta vacía de Claude')

    return {
      content,
      model: req.model ?? this.model,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        cached: false,
      },
    }
  }

  async health(): Promise<ProviderHealth> {
    const started = performance.now()
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, {
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(8_000),
      })
      return {
        ok: res.ok,
        latencyMs: Math.round(performance.now() - started),
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      }
    } catch (error) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : 'Sin conexión',
      }
    }
  }
}
