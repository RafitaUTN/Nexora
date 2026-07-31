import { truncate } from '@documind/shared'
import type { AIProvider } from '../ports/ai-provider'
import type { AiCacheRepository, AiUsageRepository, DocumentRepository } from '../ports/repositories'
import type { AppSettings } from '../entities/settings'
import type { EventBus } from '../ports/event-bus'
import { estimateCost, parseJson, requestHash } from './ai-utils'

export interface DocumentSummaryResult {
  documentId: number
  summary: string
  keyPoints: string[]
  provider: string
  model: string
  cached: boolean
  createdAt: string
}

export interface SummarizeDeps {
  ai: AIProvider | null
  documents: DocumentRepository
  cache: AiCacheRepository
  usage: AiUsageRepository
  bus: EventBus
  settings: () => AppSettings
}

const SUMMARIZE_SYSTEM_PROMPT = `Eres un asistente de oficina que resume documentos para una PYME.
Genera un resumen claro y conciso en el mismo idioma del documento.
Responde SOLO con JSON válido sin markdown:
{"summary":"<resumen en 3-5 frases>","key_points":["<punto clave 1>","<punto clave 2>",...]}`

interface SummarizeRaw {
  summary?: string
  key_points?: string[]
}

/**
 * Resumen de un documento mediante IA, con caché y presupuesto de tokens.
 * El resultado no se persiste: la caché (por hash) evita repetir coste.
 */
export class SummarizeService {
  constructor(private readonly deps: SummarizeDeps) {}

  async summarize(documentId: number): Promise<DocumentSummaryResult | null> {
    const provider = this.deps.ai
    if (!provider) return null

    const doc = await this.deps.documents.findById(documentId)
    if (!doc) return null

    const content = await this.deps.documents.getContent(documentId)
    const settings = this.deps.settings()
    const budget = settings.ai.tokenBudget
    const text = truncate(content ?? '', Math.max(1_000, budget * 3))
    const model = settings.ai.model || ''

    const prompt = [
      { role: 'system' as const, content: SUMMARIZE_SYSTEM_PROMPT },
      { role: 'user' as const, content: `Archivo: ${doc.filename}\n\nTexto:\n${text}` },
    ]
    const hash = requestHash(model, prompt)

    const cachedRaw = await this.deps.cache.get(hash)
    if (cachedRaw) {
      const parsed = parseJson<SummarizeRaw>(cachedRaw)
      if (parsed?.summary) {
        return this.result(documentId, parsed, model || provider.id, true)
      }
    }

    const started = performance.now()
    let response
    try {
      response = await provider.chat({
        messages: prompt,
        model: model || undefined,
        temperature: 0.3,
        responseFormat: 'json',
      })
    } catch (error) {
      this.deps.bus.emit('notification', {
        level: 'error',
        title: 'Resumen fallido',
        body: error instanceof Error ? error.message : 'Error desconocido',
      })
      return null
    }

    const latencyMs = Math.round(performance.now() - started)
    await this.deps.usage.record({
      provider: provider.id,
      model: response.model,
      task: 'summarize',
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      estCostUsd: estimateCost(response.model, response.usage),
      latencyMs,
      cached: false,
    })

    const parsed = parseJson<SummarizeRaw>(response.content)
    if (!parsed?.summary) {
      this.deps.bus.emit('notification', {
        level: 'warning',
        title: 'Resumen no válido',
        body: 'El proveedor devolvió una respuesta inesperada.',
      })
      return null
    }

    await this.deps.cache.set(hash, response.content, settings.ai.maxCacheAgeDays * 86_400)
    return this.result(documentId, parsed, response.model, false)
  }

  private result(
    documentId: number,
    parsed: SummarizeRaw,
    model: string,
    cached: boolean,
  ): DocumentSummaryResult {
    return {
      documentId,
      summary: parsed.summary ?? '',
      keyPoints: (parsed.key_points ?? []).slice(0, 8),
      provider: this.deps.ai?.id ?? 'unknown',
      model,
      cached,
      createdAt: new Date().toISOString(),
    }
  }
}
