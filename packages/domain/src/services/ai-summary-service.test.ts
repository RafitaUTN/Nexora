import { describe, expect, it } from 'vitest'
import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth } from '../ports/ai-provider'
import { SummarizeService } from './ai-summary-service'
import {
  FakeAiCacheRepository,
  FakeAiUsageRepository,
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
        usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140, cached: false },
      }
    },
    async health(): Promise<ProviderHealth> {
      return { ok: true, latencyMs: 10 }
    },
  }
}

const JSON_RESPONSE = JSON.stringify({
  summary: 'Documento de compra.',
  key_points: ['Factura de 120.50 €', 'Proveedor ACME'],
})

describe('SummarizeService', () => {
  it('devuelve null sin proveedor configurado', async () => {
    const service = new SummarizeService({
      ai: null,
      documents: new FakeDocumentRepository(),
      cache: new FakeAiCacheRepository(),
      usage: new FakeAiUsageRepository(),
      bus: new FakeEventBus(),
      settings: () => makeSettings(),
    })
    expect(await service.summarize(1)).toBeNull()
  })

  it('resume el documento y registra el consumo', async () => {
    const documents = new FakeDocumentRepository()
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
    await documents.setContent(doc.id, 'texto del documento')

    const service = new SummarizeService({
      ai: makeFakeProvider(() => JSON_RESPONSE),
      documents,
      cache: new FakeAiCacheRepository(),
      usage,
      bus,
      settings: () => makeSettings(),
    })
    const result = await service.summarize(doc.id)

    expect(result?.summary).toBe('Documento de compra.')
    expect(result?.keyPoints).toEqual(['Factura de 120.50 €', 'Proveedor ACME'])
    expect(result?.cached).toBe(false)
    expect(result?.model).toBe('openai/gpt-4o-mini')
    expect(usage.records[0]?.task).toBe('summarize')
    expect(usage.records[0]?.promptTokens).toBe(100)
  })

  it('usa la caché sin llamar al proveedor', async () => {
    const documents = new FakeDocumentRepository()
    const cache = new FakeAiCacheRepository()
    const usage = new FakeAiUsageRepository()
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
    const service = new SummarizeService({
      ai: makeFakeProvider(() => {
        calls += 1
        return JSON_RESPONSE
      }),
      documents,
      cache,
      usage,
      bus: new FakeEventBus(),
      settings: () => makeSettings(),
    })
    const first = await service.summarize(doc.id)
    expect(first?.cached).toBe(false)
    expect(calls).toBe(1)

    const second = await service.summarize(doc.id)
    expect(second?.cached).toBe(true)
    expect(calls).toBe(1)
    expect(usage.records).toHaveLength(1)
  })

  it('devuelve null si el proveedor no responde JSON válido', async () => {
    const documents = new FakeDocumentRepository()
    const bus = new FakeEventBus()
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

    const service = new SummarizeService({
      ai: makeFakeProvider(() => 'no es json'),
      documents,
      cache: new FakeAiCacheRepository(),
      usage: new FakeAiUsageRepository(),
      bus,
      settings: () => makeSettings(),
    })
    expect(await service.summarize(doc.id)).toBeNull()
    expect(bus.eventsOf('notification')).toHaveLength(1)
  })

  it('devuelve null y notifica si el proveedor lanza un error', async () => {
    const documents = new FakeDocumentRepository()
    const usage = new FakeAiUsageRepository()
    const bus = new FakeEventBus()
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

    const throwing: AIProvider = {
      id: 'openrouter',
      async chat(): Promise<ChatResponse> {
        throw new Error('timeout')
      },
      async health(): Promise<ProviderHealth> {
        return { ok: false, latencyMs: 0 }
      },
    }
    const service = new SummarizeService({
      ai: throwing,
      documents,
      cache: new FakeAiCacheRepository(),
      usage,
      bus,
      settings: () => makeSettings(),
    })
    expect(await service.summarize(doc.id)).toBeNull()
    expect(usage.records).toHaveLength(0)
    const notification = bus.eventsOf('notification')[0] as { title?: string; body?: string }
    expect(notification?.title).toBe('Resumen fallido')
    expect(notification?.body).toContain('timeout')
  })
})
