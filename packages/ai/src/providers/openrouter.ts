import type { ChatRequest, ChatResponse, ProviderConfig, ProviderHealth } from '@documind/domain'
import type { AIProvider } from '@documind/domain'
import { jsonRequest } from './http-client'

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  error?: { message?: string }
}

/**
 * Adaptador OpenRouter (contrato OpenAI-compatible, muchos modelos).
 */
export class OpenRouterProvider implements AIProvider {
  readonly id = 'openrouter' as const
  private readonly baseUrl: string
  private readonly model: string

  constructor(private readonly config: ProviderConfig) {
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1'
    this.model = config.defaultModel
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: req.model ?? this.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.1,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    }
    const data = (await jsonRequest('/chat/completions', {
      baseUrl: this.baseUrl,
      apiKey: this.config.apiKey,
      body,
    })) as OpenRouterResponse

    if (data.error?.message) throw new Error(data.error.message)
    const content = data.choices?.[0]?.message?.content ?? ''
    if (!content) throw new Error('Respuesta vacía de OpenRouter')

    return {
      content,
      model: req.model ?? this.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
        cached: false,
      },
    }
  }

  async health(): Promise<ProviderHealth> {
    const started = performance.now()
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, {
        headers: { authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { ok: true, latencyMs: Math.round(performance.now() - started) }
    } catch (error) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : 'Sin conexión',
      }
    }
  }

  async listModels(): Promise<string[]> {
    const data = (await jsonRequest('/models', {
      baseUrl: this.baseUrl,
      apiKey: this.config.apiKey,
      method: 'GET',
      timeoutMs: 8_000,
      maxRetries: 0,
    })) as { data?: { id?: string }[] }
    return (data.data ?? []).map((model) => model.id ?? '').filter(Boolean)
  }
}
