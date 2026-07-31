import type { ChatRequest, ChatResponse, ProviderConfig, ProviderHealth } from '@documind/domain'
import type { AIProvider } from '@documind/domain'
import { jsonRequest } from './http-client'

interface OllamaResponse {
  message?: { content?: string }
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

/**
 * Adaptador Ollama (local, sin conexión). No requiere API key.
 */
export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const
  private readonly baseUrl: string
  private readonly model: string

  constructor(private readonly config: ProviderConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434'
    this.model = config.defaultModel
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const data = (await jsonRequest('/api/chat', {
      baseUrl: this.baseUrl,
      body: {
        model: req.model ?? this.model,
        messages: req.messages,
        stream: false,
        format: req.responseFormat === 'json' ? 'json' : undefined,
        options: { temperature: req.temperature ?? 0.1, num_predict: req.maxTokens ?? 2048 },
      },
    })) as OllamaResponse

    if (data.error) throw new Error(data.error)
    const content = data.message?.content ?? ''
    if (!content) throw new Error('Respuesta vacía de Ollama')

    return {
      content,
      model: req.model ?? this.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        cached: false,
      },
    }
  }

  async health(): Promise<ProviderHealth> {
    const started = performance.now()
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/tags`, {
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

  async listModels(): Promise<string[]> {
    const data = (await jsonRequest('/api/tags', {
      baseUrl: this.baseUrl,
      method: 'GET',
      timeoutMs: 8_000,
      maxRetries: 0,
    })) as { models?: { name?: string }[] }
    return (data.models ?? []).map((model) => model.name ?? '').filter(Boolean)
  }
}
