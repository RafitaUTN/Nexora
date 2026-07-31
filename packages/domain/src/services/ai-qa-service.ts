import { truncate } from '@documind/shared'
import type { AIProvider } from '../ports/ai-provider'
import type {
  AiCacheRepository,
  AiUsageRepository,
  DocumentRepository,
  SearchRepository,
} from '../ports/repositories'
import type { AppSettings } from '../entities/settings'
import type { EventBus } from '../ports/event-bus'
import { estimateCost, parseJson, requestHash } from './ai-utils'

export interface QaCitation {
  documentId: number
  filename: string
  score: number
}

export interface QaResult {
  answer: string
  citations: QaCitation[]
  provider: string
  model: string
  cached: boolean
  createdAt: string
}

export interface QaDeps {
  ai: AIProvider | null
  documents: DocumentRepository
  search: SearchRepository
  cache: AiCacheRepository
  usage: AiUsageRepository
  bus: EventBus
  settings: () => AppSettings
}

const QA_SYSTEM_PROMPT = `Eres un asistente que responde preguntas sobre los documentos de una PYME.
Usa SOLO los fragmentos proporcionados entre [fragmento N]. Si la respuesta no
está en los fragmentos, dilo con claridad.
Responde SOLO con JSON válido sin markdown:
{"answer":"<respuesta>"}`

interface QaRaw {
  answer?: string
}

/** Número de fragmentos que se entregan como contexto a la IA. */
const DEFAULT_LIMIT = 5
/** Caracteres máximos de cada fragmento de documento. */
const FRAGMENT_CHARS = 2_000

/**
 * Preguntas y respuestas sobre la documentación (RAG local): el índice FTS5
 * recupera los documentos más relevantes y la IA responde citando sus
 * fragmentos. La caché cubre la misma pregunta con los mismos candidatos.
 */
export class QaService {
  constructor(private readonly deps: QaDeps) {}

  async ask(question: string, limit = DEFAULT_LIMIT): Promise<QaResult> {
    const provider = this.deps.ai
    const trimmed = question.trim()
    if (!trimmed) {
      return this.empty('Escribe una pregunta para buscar en tus documentos.', provider?.id ?? 'unknown')
    }
    if (!provider) {
      return this.empty('La IA no está configurada. Configura un proveedor en Ajustes.', 'unknown')
    }

    const hits = await this.deps.search.fullText(trimmed, limit)
    if (hits.length === 0) {
      return this.empty(
        'No se encontraron documentos relacionados con tu pregunta.',
        provider.id,
      )
    }

    const citations: QaCitation[] = hits.map((hit) => ({
      documentId: hit.document.id,
      filename: hit.document.filename,
      score: hit.score,
    }))

    const fragments: string[] = []
    for (const hit of hits) {
      const content = await this.deps.documents.getContent(hit.document.id)
      fragments.push(
        `[fragmento ${fragments.length + 1}] ${hit.document.filename}:\n${truncate(content ?? '', FRAGMENT_CHARS)}`,
      )
    }

    const settings = this.deps.settings()
    const model = settings.ai.model || ''
    const prompt = [
      { role: 'system' as const, content: QA_SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: `Pregunta: ${trimmed}\n\nFragmentos:\n${fragments.join('\n\n')}`,
      },
    ]
    const hash = requestHash(model, [trimmed, fragments])

    const cachedRaw = await this.deps.cache.get(hash)
    if (cachedRaw) {
      const parsed = parseJson<QaRaw>(cachedRaw)
      if (parsed?.answer) {
        return { answer: parsed.answer, citations, provider: provider.id, model: model || provider.id, cached: true, createdAt: new Date().toISOString() }
      }
    }

    const started = performance.now()
    let response
    try {
      response = await provider.chat({
        messages: prompt,
        model: model || undefined,
        temperature: 0.2,
        responseFormat: 'json',
      })
    } catch (error) {
      this.deps.bus.emit('notification', {
        level: 'error',
        title: 'Pregunta fallida',
        body: error instanceof Error ? error.message : 'Error desconocido',
      })
      return this.empty('El proveedor de IA no respondió. Inténtalo de nuevo.', provider.id, citations)
    }

    const latencyMs = Math.round(performance.now() - started)
    await this.deps.usage.record({
      provider: provider.id,
      model: response.model,
      task: 'qa',
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      estCostUsd: estimateCost(response.model, response.usage),
      latencyMs,
      cached: false,
    })

    const parsed = parseJson<QaRaw>(response.content)
    if (!parsed?.answer) {
      return this.empty('El proveedor devolvió una respuesta inesperada.', provider.id, citations)
    }

    await this.deps.cache.set(hash, response.content, settings.ai.maxCacheAgeDays * 86_400)
    return {
      answer: parsed.answer,
      citations,
      provider: provider.id,
      model: response.model,
      cached: false,
      createdAt: new Date().toISOString(),
    }
  }

  private empty(
    answer: string,
    provider: string,
    citations: QaCitation[] = [],
  ): QaResult {
    return {
      answer,
      citations,
      provider,
      model: '',
      cached: false,
      createdAt: new Date().toISOString(),
    }
  }
}
