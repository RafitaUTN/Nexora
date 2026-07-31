import mammoth from 'mammoth'
import type { ExtractedDocument } from '../types'

/** Word .docx (y .doc vía conversión interna de mammoth cuando es compatible). */
export async function extractDocx(buffer: Uint8Array): Promise<ExtractedDocument> {
  const { value, messages } = await mammoth.extractRawText({
    buffer: Buffer.from(buffer),
  })
  return {
    text: value,
    metadata: {
      warnings: messages.map((m) => m.message),
    },
  }
}
