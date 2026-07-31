import { describe, expect, it } from 'vitest'
import { DocumentService } from './document-service'
import { FakeDocumentRepository, FakeEventBus } from '../test/fakes'
import type { RegisterDocumentInput } from './document-service'

function input(overrides: Partial<RegisterDocumentInput> = {}): RegisterDocumentInput {
  return {
    sourceId: 1,
    path: '/docs/factura.pdf',
    filename: 'factura.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    hashSha256: 'abc123',
    fileMtimeMs: 1_700_000_000_000,
    ...overrides,
  }
}

describe('DocumentService', () => {
  it('registra un documento nuevo y emite document:added', async () => {
    const repo = new FakeDocumentRepository()
    const bus = new FakeEventBus()
    const service = new DocumentService(repo, bus)
    const doc = await service.register(input())
    expect(doc.id).toBeGreaterThan(0)
    expect(repo.history[0]?.action).toBe('created')
    expect(bus.eventsOf('document:added')).toHaveLength(1)
  })

  it('marca como duplicado si ya existe un documento con el mismo hash', async () => {
    const repo = new FakeDocumentRepository()
    const service = new DocumentService(repo, new FakeEventBus())
    const first = await service.register(input())
    const second = await service.register(input({ path: '/docs/otra/copia.pdf', filename: 'copia.pdf' }))
    const saved = await repo.findById(second.id)
    expect(saved?.isDuplicateOf).toBe(first.id)
    expect(repo.history[1]?.detail).toBe(`Duplicado de #${first.id}`)
  })

  it('versiona cuando cambia hash o tamaño en la misma ruta', async () => {
    const repo = new FakeDocumentRepository()
    const service = new DocumentService(repo, new FakeEventBus())
    await service.register(input())
    const updated = await service.register(input({ hashSha256: 'nuevo-hash', sizeBytes: 2048 }))
    expect(updated.version).toBe(2)
    expect(repo.history.some((h) => h.action === 'updated')).toBe(true)
  })

  it('no versiona si el archivo no cambió', async () => {
    const repo = new FakeDocumentRepository()
    const service = new DocumentService(repo, new FakeEventBus())
    await service.register(input())
    const again = await service.register(input())
    expect(again.version).toBe(1)
    expect(repo.history.filter((h) => h.action === 'updated')).toHaveLength(0)
  })

  it('elimina marcando como borrado y registra historial', async () => {
    const repo = new FakeDocumentRepository()
    const service = new DocumentService(repo, new FakeEventBus())
    const doc = await service.register(input())
    await service.remove(doc.id)
    expect((await repo.findById(doc.id))?.deletedAt).not.toBeNull()
    expect(repo.history.some((h) => h.action === 'deleted')).toBe(true)
  })

  it('setStatus emite document:status', async () => {
    const repo = new FakeDocumentRepository()
    const bus = new FakeEventBus()
    const service = new DocumentService(repo, bus)
    const doc = await service.register(input())
    await service.setStatus(doc.id, 'indexed')
    const event = bus.eventsOf('document:status')[0] as { documentId: number; status: string }
    expect(event).toMatchObject({ documentId: doc.id, status: 'indexed' })
  })

  it('rechaza entradas inválidas con Zod', async () => {
    const service = new DocumentService(new FakeDocumentRepository(), new FakeEventBus())
    await expect(service.register(input({ filename: '' }))).rejects.toThrow()
  })
})
