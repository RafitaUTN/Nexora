import type { ExtractedDocument } from '../types'

/** Texto plano (txt, md, csv, json, html). */
export async function extractPlainText(buffer: Uint8Array): Promise<ExtractedDocument> {
  return {
    text: new TextDecoder('utf-8').decode(buffer),
    metadata: {},
  }
}
