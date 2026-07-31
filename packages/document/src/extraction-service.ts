import { detectMime } from './mime'
import { sha256 } from './hash'
import type { ExtractedDocument } from './types'
import { extractPdfText, needsOcr } from './extractors/pdf'
import { rasterizePdfToImages } from './extractors/pdf-raster'
import { extractDocx } from './extractors/docx'
import { extractXlsx } from './extractors/xlsx'
import { extractPlainText } from './extractors/text'
import { extractImage } from './extractors/image'

export interface ExtractOptions {
  /** Si el PDF es escaneado (sin texto), rasterizar para OCR. */
  ocrScannedPdf?: boolean
  /** Resolución del rasterizado (multiplicador del viewport pdf.js). */
  rasterScale?: number
}

/**
 * Servicio de extracción de texto de documentos. Despacha por MIME real
 * (magic bytes) y enriquece con hash sha256.
 */
export class ExtractionService {
  async extract(buffer: Uint8Array, filename: string, options: ExtractOptions = {}): Promise<ExtractedDocument> {
    const detected = detectMime(buffer, filename)
    const mime = detected === 'application/zip' ? this.inferZipMime(filename) : detected
    const hash = await sha256(buffer)
    const base: ExtractedDocument = { text: '', metadata: { mimeType: mime, size: buffer.byteLength, hash } }

    try {
      if (mime === 'application/pdf') {
        const result = await extractPdfText(buffer)
        if (needsOcr(result) && options.ocrScannedPdf !== false) {
          const raster = await rasterizePdfToImages(buffer, 20, options.rasterScale ?? 2)
          return { text: '', metadata: { ...result.metadata, ...raster.metadata, mimeType: mime, size: buffer.byteLength, hash }, images: raster.images }
        }
        return { text: result.text, metadata: { ...result.metadata, mimeType: mime, size: buffer.byteLength, hash } }
      }
      if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/msword') {
        const result = await extractDocx(buffer)
        return { text: result.text, metadata: { ...result.metadata, mimeType: mime, size: buffer.byteLength, hash } }
      }
      if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mime === 'text/csv' || mime === 'application/vnd.ms-excel') {
        const result = mime.startsWith('text/') ? await extractPlainText(buffer) : await extractXlsx(buffer)
        return { text: result.text, metadata: { ...result.metadata, mimeType: mime, size: buffer.byteLength, hash } }
      }
      if (mime.startsWith('image/')) {
        const result = await extractImage(buffer)
        return { text: '', metadata: { ...result.metadata, mimeType: mime, size: buffer.byteLength, hash } }
      }
      const text = await extractPlainText(buffer)
      return { text: text.text, metadata: { ...text.metadata, mimeType: mime, size: buffer.byteLength, hash } }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...base, metadata: { ...base.metadata, error: message } }
    }
  }

  private inferZipMime(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    switch (ext) {
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      default:
        return 'application/zip'
    }
  }
}

export * from './mime'
export * from './hash'
export * from './types'
