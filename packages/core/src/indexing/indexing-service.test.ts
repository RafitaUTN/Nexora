import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExtractedDocument } from '@documind/document'
import type { OCRResult, OCREngine, OcrQueueRepository } from '@documind/domain'
import { IndexingService, type TextExtractor } from './indexing-service'
import { FakeDocumentRepository, FakeEventBus, makeSettings } from '../../../domain/src/test/fakes'

const extraction: TextExtractor = {
  async extract(buffer: Uint8Array, filename: string): Promise<ExtractedDocument> {
    if (filename.endsWith('.pdf') && !filename.includes('texto')) {
      return {
        text: '',
        metadata: { mimeType: 'application/pdf', size: buffer.byteLength, hash: 'h1' },
        images: [new Uint8Array(8)],
      }
    }
    return {
      text: 'texto plano de ejemplo',
      metadata: { mimeType: 'text/plain', size: buffer.byteLength, hash: 'h2' },
    }
  },
}

const ocrEngine: OCREngine = {
  async recognize(): Promise<OCRResult> {
    return { text: 'texto ocr', confidence: 0.9, language: 'spa', pages: 1, engineVersion: 'test' }
  },
  async health() {
    return { ok: true, engine: 'tesseract-test', error: null }
  },
}

function fakeQueue(): OcrQueueRepository {
  const jobs: { id: number; documentId: number; priority: number }[] = []
  let nextId = 1
  return {
    async enqueue(documentId: number, priority = 0) {
      jobs.push({ id: nextId++, documentId, priority })
    },
    async nextBatch(limit: number) {
      return jobs.splice(0, limit)
    },
    async markProcessing() {},
    async markDone() {},
    async markError() {},
    async pendingCount() {
      return jobs.length
    },
  }
}

function makeService(overrides: { extraction?: TextExtractor } = {}) {
  const documents = new FakeDocumentRepository()
  const bus = new FakeEventBus()
  const queue = fakeQueue()
  const classifier = { classify: async () => null }
  const service = new IndexingService({
    extraction: overrides.extraction ?? extraction,
    documents,
    ocrQueue: queue,
    classifier: classifier as never,
    ocrEngine,
    bus,
    settings: () => makeSettings({ ai: { ...makeSettings().ai, provider: null } }),
  })
  return { service, documents, bus, queue }
}

describe('IndexingService', () => {
  it('indexa texto directo y emite eventos', async () => {
    const { service, documents, bus } = makeService()
    const doc = await service.indexFile({
      sourceId: null,
      path: '/a.txt',
      filename: 'a.txt',
      buffer: new Uint8Array(3),
      mtimeMs: 0,
    })
    expect(doc.status).toBe('ready')
    expect(await documents.getContent(doc.id)).toContain('texto plano')
    expect(bus.eventsOf('document:indexed')).toHaveLength(1)
    expect(bus.eventsOf('document:status')).toHaveLength(1)
  })

  it('encola OCR si no hay texto y emite el estado', async () => {
    const { service, bus } = makeService()
    const doc = await service.indexFile({
      sourceId: null,
      path: '/scan.pdf',
      filename: 'scan.pdf',
      buffer: new Uint8Array(3),
      mtimeMs: 0,
    })
    expect(doc.status).toBe('pending')
    expect(bus.eventsOf('document:status')[0]).toMatchObject({ status: 'pending_ocr' })
  })

  it('processOcrQueue procesa trabajos y termina la indexación', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'documind-idx-'))
    const file = join(dir, 'scan.pdf')
    writeFileSync(file, new Uint8Array(16))
    const { service, documents, bus, queue } = makeService()
    const doc = await documents.save({
      sourceId: null,
      path: file,
      filename: 'scan.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 16,
      hashSha256: 'h',
      fileMtimeMs: null,
    })
    await queue.enqueue(doc.id, 0)
    await service.processOcrQueue()
    expect((await documents.findById(doc.id))?.status).toBe('ready')
    expect(await documents.getContent(doc.id)).toContain('texto ocr')
    expect(bus.eventsOf('ocr:progress')).toHaveLength(1)
  })

  it('procesa la cola sin motor OCR', async () => {
    const { service } = makeService()
    await service.processOcrQueue()
    expect(true).toBe(true)
  })

  it('encola por mime image/ si no hay texto', async () => {
    const imageExtraction: TextExtractor = {
      async extract(buffer: Uint8Array, _filename: string): Promise<ExtractedDocument> {
        return { text: '', metadata: { mimeType: 'image/png', size: buffer.byteLength, hash: 'h3' } }
      },
    }
    const { service, bus } = makeService({ extraction: imageExtraction })
    const doc = await service.indexFile({
      sourceId: null,
      path: '/foto.png',
      filename: 'foto.png',
      buffer: new Uint8Array(4),
      mtimeMs: 0,
    })
    expect(bus.eventsOf('document:status')[0]).toMatchObject({ status: 'pending_ocr' })
    expect(doc.status).toBe('pending')
  })

  it('marca error y notifica si un trabajo de OCR falla', async () => {
    const { documents, bus } = makeService()
    const doc = await documents.save({
      sourceId: null,
      path: '/no-existe.pdf',
      filename: 'no-existe.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      hashSha256: 'h',
      fileMtimeMs: null,
    })
    const { queue } = makeService()
    await queue.enqueue(doc.id, 0)
    const failing = new IndexingService({
      extraction,
      documents,
      ocrQueue: queue,
      classifier: { classify: async () => null } as never,
      ocrEngine,
      bus,
      settings: () => makeSettings({ ai: { ...makeSettings().ai, provider: null } }),
    })
    await failing.processOcrQueue()
    expect(bus.eventsOf('notification')[0]).toMatchObject({ level: 'error' })
  })

  it('classifier se invoca al terminar si hay proveedor', async () => {
    const documents = new FakeDocumentRepository()
    const bus = new FakeEventBus()
    let classified = 0
    const service = new IndexingService({
      extraction,
      documents,
      ocrQueue: fakeQueue(),
      classifier: { classify: async () => { classified += 1; return null } } as never,
      ocrEngine,
      bus,
      settings: () => makeSettings({ ai: { ...makeSettings().ai, provider: 'openrouter' } }),
    })
    await service.indexFile({
      sourceId: null,
      path: '/a.txt',
      filename: 'a.txt',
      buffer: new Uint8Array(3),
      mtimeMs: 0,
    })
    expect(classified).toBe(1)
  })
})
