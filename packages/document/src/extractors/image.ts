import type { ExtractedDocument, DocumentMetadata } from '../types'

/**
 * Imágenes: sin texto por sí mismas (va por OCR), pero aporta metadatos
 * (dimensiones, formato) vía sharp.
 */
export async function extractImage(buffer: Uint8Array): Promise<ExtractedDocument> {
  const metadata: DocumentMetadata = { size: buffer.byteLength }
  try {
    const sharp = (await import('sharp')).default
    const info = await sharp(buffer).metadata()
    metadata.width = info.width
    metadata.height = info.height
    metadata.format = info.format
  } catch {
    // sharp no disponible (build sin módulo nativo): se continúa sin metadatos
  }
  return { text: '', metadata }
}
