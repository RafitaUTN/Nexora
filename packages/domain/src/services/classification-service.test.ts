import { describe, expect, it } from 'vitest'
import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth } from '../ports/ai-provider'
import { ClassificationService } from './classification-service'
import {
  FakeAiCacheRepository,
  FakeAiUsageRepository,
  FakeClassificationRepository,
  FakeDocumentRepository,
  FakeEventBus,
  makeSettings,
} from '../test/fakes'

function makeFakeProvider(respond: (req: ChatRequest) => string): AIProvider {
  return {
    id: 'openrouter',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      return {
        content: respond(req),
        model: 'openai/gpt-4o-mini',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, cached: false },
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

const JSON_RESPONSE = JSON.stringify({
  category: 'factura',
  confidence: 0.95,
  summary: 'Factura de compra',
  entities: [{ kind: 'amount', value: '120.50' }],
  tags: ['factura'],
})

describe('ClassificationService', () => {
  it('devuelve null sin proveedor configurado', async () => {
    const service = new ClassificationService({
      ai: null,
      documents: new FakeDocumentRepository(),
      classifications: new FakeClassificationRepository(),
      cache: new FakeAiCacheRepository(),
      usage: new FakeAiUsageRepository(),
      bus: new FakeEventBus(),
      settings: () => makeSettings(),
    })
    expect(await service.classify(1)).toBeNull()
  })

  it('clasifica, registra consumo y persiste', async () => {
    const documents = new FakeDocumentRepository()
    const classifications = new FakeClassificationRepository()
    const usage = new FakeAiUsageRepository()
    const bus = new FakeEventBus()
    const doc = await documents.save({
      sourceId: 1,
      path: '/f.pdf',
      filename: 'f.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      hashSha256: 'h',
      fileMtimeMs: null,
    })
    await documents.setContent(doc.id, 'texto de la factura')
    const service = new ClassificationService({
      ai: makeFakeProvider(() => JSON_RESPONSE),
      documents,
      classifications,
      cache: new FakeAiCacheRepository(),
      usage,
      bus,
      settings: () => makeSettings(),
    })
    const result = await service.classify(doc.id)
    expect(result?.category).toBe('factura')
    expect(result?.cached).toBe(false)
    expect(classifications.saved?.category).toBe('factura')
    expect(classifications.entities[0]?.value).toBe('120.50')
    expect(usage.records[0]?.task).toBe('classify')
    expect(usage.records[0]?.promptTokens).toBe(100)
    expect(bus.eventsOf('document:classified')).toHaveLength(1)
  })

  it('usa la caché y marca cached=true sin llamar al proveedor', async () => {
    const documents = new FakeDocumentRepository()
    const cache = new FakeAiCacheRepository()
    const usage = new FakeAiUsageRepository()
    const classifications = new FakeClassificationRepository()
    const doc = await documents.save({
      sourceId: 1,
      path: '/f.pdf',
      filename: 'f.pdf',
      ext: 'pdf',
      mimeType: null,
      sizeBytes: 10,
      hashSha256: 'h',
      fileMtimeMs: null,
    })
    await documents.setContent(doc.id, 'contenido')
    let calls = 0
    const service = new ClassificationService({
      ai: makeFakeProvider(() => {
        calls += 1
        return JSON_RESPONSE
      }),
      documents,
      classifications,
      cache,
      usage,
      bus: new FakeEventBus(),
      settings: () => makeSettings(),
    })
    const first = await service.classify(doc.id)
    expect(first?.cached).toBe(false)
    expect(calls).toBe(1)
    expect(usage.records).toHaveLength(1)
    classifications.saved = null
    const second = await service.classify(doc.id)
    expect(second?.cached).toBe(true)
    expect(calls).toBe(1)
    expect(usage.records).toHaveLength(1)
  })

  it('devuelve la clasificación existente sin re-clasificar', async () => {
    const documents = new FakeDocumentRepository()
    const classifications = new FakeClassificationRepository()
    const doc = await documents.save({
      sourceId: null,
      path: '/f.pdf',
      filename: 'f.pdf',
      ext: 'pdf',
      mimeType: null,
      sizeBytes: 1,
      hashSha256: 'h',
      fileMtimeMs: null,
    })
    await classifications.save({
      documentId: doc.id,
      category: 'contrato',
      confidence: 0.9,
      provider: 'openrouter',
      model: 'm',
      cached: false,
      createdAt: new Date().toISOString(),
    })
    const service = new ClassificationService({
      ai: makeFakeProvider(() => {
        throw new Error('no debería llamarse')
      }),
      documents,
      classifications,
      cache: new FakeAiCacheRepository(),
      usage: new FakeAiUsageRepository(),
      bus: new FakeEventBus(),
      settings: () => makeSettings(),
    })
    const result = await service.classify(doc.id)
    expect(result?.category).toBe('contrato')
    expect(result?.cached).toBe(false)
  })

  it('emite notificación y devuelve null si el proveedor responde inválido', async () => {
    const documents = new FakeDocumentRepository()
    const bus = new FakeEventBus()
    const doc = await documents.save({
      sourceId: null,
      path: '/f.pdf',
      filename: 'f.pdf',
      ext: 'pdf',
      mimeType: null,
      sizeBytes: 1,
      hashSha256: 'h',
      fileMtimeMs: null,
    })
    await documents.setContent(doc.id, 'x')
    const service = new ClassificationService({
      ai: makeFakeProvider(() => 'no-json'),
      documents,
      classifications: new FakeClassificationRepository(),
      cache: new FakeAiCacheRepository(),
      usage: new FakeAiUsageRepository(),
      bus,
      settings: () => makeSettings(),
    })
    const result = await service.classify(doc.id)
    expect(result).toBeNull()
    expect(bus.eventsOf('notification')[0]).toMatchObject({ level: 'warning' })
  })

  it('devuelve null si el proveedor lanza y emite notificación de error', async () => {
    const documents = new FakeDocumentRepository()
    const bus = new FakeEventBus()
    const doc = await documents.save({
      sourceId: null,
      path: '/f.pdf',
      filename: 'f.pdf',
      ext: 'pdf',
      mimeType: null,
      sizeBytes: 1,
      hashSha256: 'h',
      fileMtimeMs: null,
    })
    const service = new ClassificationService({
      ai: makeFakeProvider(() => {
        throw new Error('HTTP 500')
      }),
      documents,
      classifications: new FakeClassificationRepository(),
      cache: new FakeAiCacheRepository(),
      usage: new FakeAiUsageRepository(),
      bus,
      settings: () => makeSettings(),
    })
    const result = await service.classify(doc.id)
    expect(result).toBeNull()
    expect(bus.eventsOf('notification')[0]).toMatchObject({ level: 'error', body: 'HTTP 500' })
  })
})
