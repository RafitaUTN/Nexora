import { createHash } from 'node:crypto'
import { truncate } from '@documind/shared'
import type { Classification, ExtractedEntity } from '../entities/classification'
import type { AIProvider } from '../ports/ai-provider'
import type {
  AiCacheRepository,
  AiUsageRepository,
  ClassificationRepository,
  DocumentRepository,
} from '../ports/repositories'
import type { AppSettings } from '../entities/settings'
import type { EventBus } from '../ports/event-bus'

export interface ClassificationDeps {
  ai: AIProvider | null
  documents: DocumentRepository
  classifications: ClassificationRepository
  cache: AiCacheRepository
  usage: AiUsageRepository
  bus: EventBus
  settings: () => AppSettings
}

const CLASSIFY_SYSTEM_PROMPT = `Eres un clasificador de documentos para una PYME.
Clasifica el documento en una de estas categorías:
factura, contrato, recibo, presupuesto, informe, carta, curriculum, identificacion,
legal, contable, tecnico, comercial, recursos-humanos, otro.
Responde SOLO con JSON válido sin markdown:
{"category":"<categoria>","confidence":0.0-1.0,"summary":"<1 frase>",
"entities":[{"kind":"person|org|email|invoice|amount|date|iban","value":"..."}],
"tags":["<etiqueta>",...]}`

interface ClassifyRaw {
  category?: string
  confidence?: number
  summary?: string
  entities?: ExtractedEntity[]
  tags?: string[]
}

/**
 * Clasificación de documentos mediante IA, con caché y presupuesto de tokens.
 */
export class ClassificationService {
  constructor(private readonly deps: ClassificationDeps) {}

  async classify(documentId: number): Promise<Classification | null> {
    const provider = this.deps.ai
    if (!provider) return null

    const existing = await this.deps.classifications.findByDocumentId(documentId)
    if (existing && !existing.cached) return existing

    const doc = await this.deps.documents.findById(documentId)
    if (!doc) return null

    const content = await this.deps.documents.getContent(documentId)
    const settings = this.deps.settings()
    const budget = settings.ai.tokenBudget
    const text = truncate(content ?? '', Math.max(1_000, budget * 3))
    const model = settings.ai.model || ''

    const prompt = [
      { role: 'system' as const, content: CLASSIFY_SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: `Archivo: ${doc.filename}\n\nTexto:\n${text}`,
      },
    ]
    const requestHash = this.requestHash(model, prompt)

    const cached = await this.deps.cache.get(requestHash)
    if (cached) {
      return this.persistClassification(documentId, cached, model, true)
    }

    const started = performance.now()
    let response
    try {
      response = await provider.chat({
        messages: prompt,
        model: model || undefined,
        temperature: 0.1,
        responseFormat: 'json',
      })
    } catch (error) {
      this.deps.bus.emit('notification', {
        level: 'error',
        title: 'Clasificación fallida',
        body: error instanceof Error ? error.message : 'Error desconocido',
      })
      return null
    }

    const latencyMs = Math.round(performance.now() - started)
    await this.deps.usage.record({
      provider: provider.id,
      model: response.model,
      task: 'classify',
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      estCostUsd: this.estimateCost(response.model, response.usage),
      latencyMs,
      cached: false,
    })

    const parsed = this.safeParse(response.content)
    if (!parsed) {
      this.deps.bus.emit('notification', {
        level: 'warning',
        title: 'Clasificación no válida',
        body: 'El proveedor devolvió una respuesta inesperada.',
      })
      return null
    }

    await this.deps.cache.set(requestHash, JSON.stringify(parsed), settings.ai.maxCacheAgeDays * 86_400)
    return this.persistClassification(documentId, JSON.stringify(parsed), response.model, false)
  }

  private async persistClassification(
    documentId: number,
    raw: string,
    model: string,
    cached: boolean,
  ): Promise<Classification> {
    const parsed = this.safeParse(raw)
    if (!parsed) throw new Error('Respuesta de clasificación inválida')

    const classification: Classification = {
      documentId,
      category: parsed.category ?? 'otro',
      confidence: parsed.confidence ?? 0,
      provider: this.deps.ai?.id ?? 'unknown',
      model,
      cached,
      createdAt: new Date().toISOString(),
    }
    await this.deps.classifications.save(classification)
    await this.deps.classifications.saveEntities(
      documentId,
      (parsed.entities ?? []).slice(0, 50),
    )
    this.deps.bus.emit('document:indexed', { documentId })
    this.deps.bus.emit('document:classified', { documentId })
    return classification
  }

  private requestHash(model: string, messages: unknown[]): string {
    return createHash('sha256').update(`${model}|${JSON.stringify(messages)}`).digest('hex')
  }

  private safeParse(content: string): ClassifyRaw | null {
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(cleaned) as ClassifyRaw
      if (typeof parsed.category !== 'string') return null
      return parsed
    } catch {
      return null
    }
  }

  private estimateCost(model: string, usage: { promptTokens: number; completionTokens: number }): number {
    const cheap = model.toLowerCase().includes('mini')
    const perMillionInput = cheap ? 0.15 : 1.0
    const perMillionOutput = cheap ? 0.6 : 3.0
    return (
      (usage.promptTokens / 1_000_000) * perMillionInput +
      (usage.completionTokens / 1_000_000) * perMillionOutput
    )
  }
}
