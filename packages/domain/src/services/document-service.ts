import { z } from 'zod'
import type {
  Document,
  DocumentFilter,
  DocumentStats,
  DocumentSummary,
  PagedResult,
} from '../entities/document'
import type { DocumentRepository } from '../ports/repositories'
import type { EventBus } from '../ports/event-bus'
import type { HistoryEntry } from '../entities/audit'

export const registerDocumentSchema = z.object({
  sourceId: z.number().nullable(),
  path: z.string().min(1),
  filename: z.string().min(1),
  ext: z.string().min(1),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
  fileMtimeMs: z.number().nullable(),
  content: z.string().optional(),
})
export type RegisterDocumentInput = z.infer<typeof registerDocumentSchema>

/**
 * Casos de uso de documentos: registro, consulta, deduplicación y versionado.
 */
export class DocumentService {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly bus: EventBus,
  ) {}

  async register(input: RegisterDocumentInput): Promise<Document> {
    const parsed = registerDocumentSchema.parse(input)
    const existingByPath = await this.documents.findByPath(parsed.sourceId, parsed.path)
    if (existingByPath) {
      return this.handleExisting(existingByPath, parsed)
    }

    const duplicates = await this.documents.findByHash(parsed.hashSha256)
    const doc = await this.documents.save({
      sourceId: parsed.sourceId,
      path: parsed.path,
      filename: parsed.filename,
      ext: parsed.ext,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      hashSha256: parsed.hashSha256,
      fileMtimeMs: parsed.fileMtimeMs,
    })

    const original = duplicates[0]
    if (original) {
      await this.documents.setDuplicate(doc.id, original.id)
      await this.documents.addHistory({
        documentId: doc.id,
        action: 'created',
        detail: `Duplicado de #${original.id}`,
      })
    } else {
      await this.documents.addHistory({ documentId: doc.id, action: 'created' })
    }

    if (parsed.content && parsed.content.length > 0) {
      await this.documents.setContent(doc.id, parsed.content)
    }

    this.bus.emit('document:added', { documentId: doc.id })
    return doc
  }

  private async handleExisting(
    existing: Document,
    input: z.infer<typeof registerDocumentSchema>,
  ): Promise<Document> {
    if (existing.hashSha256 !== input.hashSha256 || existing.sizeBytes !== input.sizeBytes) {
      const newVersion = await this.documents.bumpVersion(existing.id)
      await this.documents.addVersion(
        existing.id,
        newVersion,
        existing.path,
        existing.hashSha256,
        existing.sizeBytes,
        'Versión previa antes de cambio',
      )
      await this.documents.addHistory({
        documentId: existing.id,
        action: 'updated',
        detail: `Cambio detectado (v${newVersion})`,
      })
    }
    return existing
  }

  async get(id: number): Promise<Document | null> {
    return this.documents.findById(id)
  }

  async getContent(id: number): Promise<string | null> {
    return this.documents.getContent(id)
  }

  async list(filter: DocumentFilter): Promise<PagedResult<DocumentSummary>> {
    return this.documents.list(filter)
  }

  async stats(): Promise<DocumentStats> {
    return this.documents.stats()
  }

  async setStatus(id: number, status: Document['status']): Promise<void> {
    await this.documents.updateStatus(id, status)
    this.bus.emit('document:status', { documentId: id, status })
  }

  async remove(id: number): Promise<void> {
    await this.documents.markDeleted(id)
    await this.documents.addHistory({ documentId: id, action: 'deleted' })
  }

  async purge(id: number): Promise<void> {
    await this.documents.remove(id)
  }

  async history(documentId: number, limit = 100): Promise<HistoryEntry[]> {
    return this.documents.listHistory(documentId, limit)
  }
}
