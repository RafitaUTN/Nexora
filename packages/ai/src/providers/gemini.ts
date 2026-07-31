import type {
  ChatRequest,
  ChatResponse,
  ProviderConfig,
  ProviderHealth,
} from '@documind/domain'
import type { AIProvider } from '@documind/domain'
import { jsonRequest } from './http-client'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  error?: { message?: string }
}

/**
 * Adaptador Google Gemini.
 */
export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const
  private readonly baseUrl: string
  private readonly model: string

  constructor(private readonly config: ProviderConfig) {
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com'
    this.model = config.defaultModel
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const system = req.messages.find((m) => m.role === 'system')
    const data = (await jsonRequest(`/v1beta/models/${req.model ?? this.model}:generateContent`, {
      baseUrl: this.baseUrl,
      apiKey: this.config.apiKey,
      headers: { 'x-goog-api-key': this.config.apiKey },
      body: {
        contents: req.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        ...(system ? { systemInstruction: { parts: [{ text: system.content }] } } : {}),
        generationConfig: {
          temperature: req.temperature ?? 0.1,
          ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
          ...(req.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
        },
      },
    })) as GeminiResponse

    if (data.error?.message) throw new Error(data.error.message)
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!content) throw new Error('Respuesta vacía de Gemini')

    return {
      content,
      model: req.model ?? this.model,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens:
          (data.usageMetadata?.promptTokenCount ?? 0) + (data.usageMetadata?.candidatesTokenCount ?? 0),
        cached: false,
      },
    }
  }

  async health(): Promise<ProviderHealth> {
    const started = performance.now()
    try {
      const res = await fetch(
        `${this.baseUrl.replace(/\/$/, '')}/v1beta/models?pageSize=1`,
        { headers: { 'x-goog-api-key': this.config.apiKey }, signal: AbortSignal.timeout(8_000) },
      )
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
