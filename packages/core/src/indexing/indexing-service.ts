import { readFile } from 'node:fs/promises'
import type {
  AppSettings,
  Document,
  DocumentRepository,
  EventBus,
  OCRResult,
  OcrQueueRepository,
} from '@documind/domain'
import type { ExtractedDocument, ExtractOptions } from '@documind/document'
import type { ClassificationService } from '@documind/domain'
import type { OCREngine } from '@documind/domain'

/** Superficie pública de extracción que consume el indexador (fácil de fakear). */
export interface TextExtractor {
  extract(buffer: Uint8Array, filename: string, options?: ExtractOptions): Promise<ExtractedDocument>
}

export interface IndexingDeps {
  extraction: TextExtractor
  documents: DocumentRepository
  ocrQueue: OcrQueueRepository
  classifier: ClassificationService
  ocrEngine: OCREngine | null
  bus: EventBus
  settings: () => AppSettings
}

export interface IndexFileInput {
  sourceId: number | null
  path: string
  filename: string
  buffer: Uint8Array
  mtimeMs: number
}

/**
 * Orquestador de indexación: extrae texto, registra el documento, encola OCR
 * si no hay texto (escaneos/imágenes) y clasifica con IA.
 */
export class IndexingService {
  private readonly ocrLanguages: string[]

  constructor(private readonly deps: IndexingDeps) {
    this.ocrLanguages = deps.settings().ocrLanguages ?? ['spa', 'eng']
  }

  async indexFile(input: IndexFileInput): Promise<Document> {
    const ext = input.filename.split('.').pop()?.toLowerCase() ?? ''
    const extracted = await this.deps.extraction.extract(input.buffer, input.filename, {
      ocrScannedPdf: true,
    })
    const { mimeType, hash } = extracted.metadata

    const doc = await this.deps.documents.save({
      sourceId: input.sourceId,
      path: input.path,
      filename: input.filename,
      ext,
      mimeType: mimeType ?? null,
      sizeBytes: input.buffer.byteLength,
      hashSha256: typeof hash === 'string' ? hash : '',
      fileMtimeMs: input.mtimeMs,
    })
    await this.deps.documents.addHistory({ documentId: doc.id, action: 'created' })

    const needsOcr = !extracted.text.trim() && (extracted.images ?? []).length > 0
    if (needsOcr) {
      await this.deps.ocrQueue.enqueue(doc.id, 0)
      this.deps.bus.emit('document:status', { documentId: doc.id, status: 'pending_ocr' })
      return doc
    }
    if (!extracted.text.trim() && (mimeType?.startsWith('image/') ?? false) && this.deps.ocrEngine) {
      await this.deps.ocrQueue.enqueue(doc.id, 1)
      this.deps.bus.emit('document:status', { documentId: doc.id, status: 'pending_ocr' })
      return doc
    }

    await this.finishIndexing(doc.id, extracted.text)
    return doc
  }

  async processOcrQueue(): Promise<void> {
    if (!this.deps.ocrEngine) return
    const batch = await this.deps.ocrQueue.nextBatch(4)
    for (const job of batch) {
      await this.deps.ocrQueue.markProcessing(job.id)
      try {
        const doc = await this.deps.documents.findById(job.documentId)
        if (!doc) throw new Error(`Documento #${job.documentId} no existe`)
        const buffer = await readFile(doc.path)
        const extracted = await this.deps.extraction.extract(new Uint8Array(buffer), doc.filename, {
          ocrScannedPdf: true,
        })

        const results: string[] = []
        if (extracted.text.trim()) {
          results.push(extracted.text)
        } else {
          const rasterImages = extracted.images ?? []
          const sources: Uint8Array[] = rasterImages.length > 0 ? rasterImages : [new Uint8Array(buffer)]
          for (const image of sources) {
            this.deps.bus.emit('ocr:progress', { processed: results.length, total: sources.length })
            const ocr: OCRResult = await this.deps.ocrEngine.recognize(
              { buffer: image, mimeType: doc.mimeType ?? 'image/png' },
              this.ocrLanguages,
            )
            results.push(ocr.text)
          }
        }

        const fullText = results.join('\n\n')
        await this.finishIndexing(doc.id, fullText)
        await this.deps.ocrQueue.markDone(job.id)
      } catch (error) {
        await this.deps.ocrQueue.markError(job.id)
        this.deps.bus.emit('notification', {
          level: 'error',
          title: 'OCR fallido',
          body: error instanceof Error ? error.message : 'Error desconocido',
        })
      }
    }
  }

  private async finishIndexing(documentId: number, text: string): Promise<void> {
    if (text.trim()) {
      await this.deps.documents.setContent(documentId, text)
      const preview = text.trim().slice(0, 300)
      await this.deps.documents.updateContentPreview(documentId, preview)
    }
    await this.deps.documents.updateStatus(documentId, 'ready')
    this.deps.bus.emit('document:indexed', { documentId })
    this.deps.bus.emit('document:status', { documentId, status: 'ready' })

    if (this.deps.settings().ai.provider !== null) {
      await this.deps.classifier.classify(documentId)
    }
  }
}
