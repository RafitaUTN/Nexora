import { describe, expect, it } from 'vitest'
import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth } from '../ports/ai-provider'
import { QaService } from './ai-qa-service'
import {
  FakeAiCacheRepository,
  FakeAiUsageRepository,
  FakeDocumentRepository,
  FakeEventBus,
  FakeSearchRepository,
  makeDocumentSummary,
  makeSettings,
} from '../test/fakes'

function makeFakeProvider(respond: (req: ChatRequest) => string): AIProvider {
  return {
    id: 'openrouter',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      return {
        content: respond(req),
        model: 'openai/gpt-4o-mini',
        usage: { promptTokens: 200, completionTokens: 60, totalTokens: 260, cached: false },
      }
    },
    async health(): Promise<ProviderHealth> {
      return { ok: true, latencyMs: 10 }
    },
    async listModels(): Promise<string[]> {
      return ['openai/gpt-4o-mini']
    },
  }
}

const JSON_RESPONSE = JSON.stringify({ answer: 'Según el documento 1, sí.' })

function makeService(
  overrides: {
    provider?: AIProvider | null
    hits?: { document: ReturnType<typeof makeDocumentSummary>; score: number }[]
    contents?: Record<number, string>
  } = {},
) {
  const documents = new FakeDocumentRepository()
  for (const [id, content] of Object.entries(overrides.contents ?? {})) {
    const doc = documents.docs.find((d) => d.id === Number(id))
    if (doc) void documents.setContent(doc.id, content)
  }
  const search = new FakeSearchRepository()
  search.hits = overrides.hits ?? []
  const usage = new FakeAiUsageRepository()
  const bus = new FakeEventBus()
  const service = new QaService({
    ai: overrides.provider === undefined ? makeFakeProvider(() => JSON_RESPONSE) : overrides.provider,
    documents,
    search,
    cache: new FakeAiCacheRepository(),
    usage,
    bus,
    settings: () => makeSettings(),
  })
  return { service, documents, search, usage, bus }
}

describe('QaService', () => {
  it('devuelve respuesta con citas de los documentos recuperados', async () => {
    const { service, usage } = makeService({
      hits: [{ document: makeDocumentSummary({ id: 1, filename: 'factura.pdf' }), score: 2.5 }],
    })
    const result = await service.ask('¿cuánto es el total?')

    expect(result.answer).toBe('Según el documento 1, sí.')
    expect(result.citations).toHaveLength(1)
    expect(result.citations[0]?.filename).toBe('factura.pdf')
    expect(result.cached).toBe(false)
    expect(usage.records[0]?.task).toBe('qa')
  })

  it('sin proveedor devuelve un mensaje indicativo', async () => {
    const { service } = makeService({ provider: null })
    const result = await service.ask('hola')
    expect(result.answer).toContain('no está configurada')
    expect(result.citations).toEqual([])
  })

  it('sin candidatos devuelve aviso sin llamar a la IA', async () => {
    const { service, usage } = makeService({ hits: [] })
    const result = await service.ask('pregunta rara')
    expect(result.answer).toContain('No se encontraron')
    expect(usage.records).toHaveLength(0)
  })

  it('usa la caché para la misma pregunta con los mismos candidatos', async () => {
    const { service, usage } = makeService({
      hits: [{ document: makeDocumentSummary({ id: 1, filename: 'a.pdf' }), score: 1.0 }],
    })
    const first = await service.ask('¿quién es el proveedor?')
    expect(first.cached).toBe(false)
    const second = await service.ask('¿quién es el proveedor?')
    expect(second.cached).toBe(true)
    expect(usage.records).toHaveLength(1)
  })

  it('pregunta vacía o solo espacios devuelve mensaje sin consultar', async () => {
    const { service } = makeService()
    const result = await service.ask('   ')
    expect(result.answer).toContain('Escribe una pregunta')
  })

  it('notifica y devuelve mensaje vacío si el proveedor lanza', async () => {
    const throwing: AIProvider = {
      id: 'openrouter',
      async chat(): Promise<ChatResponse> {
        throw new Error('rate limit')
      },
      async health(): Promise<ProviderHealth> {
        return { ok: false, latencyMs: 0 }
      },
      async listModels(): Promise<string[]> {
        return []
      },
    }
    const { service, bus } = makeService({
      provider: throwing,
      hits: [{ document: makeDocumentSummary({ id: 1, filename: 'a.pdf' }), score: 1.0 }],
    })
    const result = await service.ask('¿cuánto?')
    expect(result.answer).toContain('no respondió')
    const notification = bus.eventsOf('notification')[0] as { title?: string; body?: string }
    expect(notification?.title).toBe('Pregunta fallida')
    expect(notification?.body).toContain('rate limit')
  })

  it('devuelve mensaje si el proveedor responde JSON inválido', async () => {
    const { service } = makeService({
      provider: makeFakeProvider(() => 'no es json'),
      hits: [{ document: makeDocumentSummary({ id: 1, filename: 'a.pdf' }), score: 1.0 }],
    })
    const result = await service.ask('¿cuánto?')
    expect(result.answer).toContain('inesperada')
    expect(result.citations).toHaveLength(1)
  })
})
