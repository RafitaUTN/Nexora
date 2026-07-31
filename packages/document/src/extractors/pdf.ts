import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFile } from 'node:fs/promises'
import type { ExtractedDocument, DocumentMetadata } from '../types'

const PDFJS_ENTRY = import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')
const PDFJS_DIR = new URL('../../', PDFJS_ENTRY)
const STANDARD_FONTS_URL = new URL('standard_fonts/', PDFJS_DIR)

class NodeStandardFontDataFactory {
  private readonly baseUrl: string

  constructor({ baseUrl }: { baseUrl: string }) {
    this.baseUrl = baseUrl
  }

  async fetch({ filename }: { filename: string }): Promise<Uint8Array> {
    return new Uint8Array(await readFile(new URL(`${this.baseUrl}${filename}`)))
  }
}

export interface PdfPageText {
  pages: number
  metadata: DocumentMetadata
}

/**
 * Extrae texto de PDFs con pdfjs-dist (capa de texto). Devuelve también el
 * número de páginas y metadatos del documento.
 */
export async function extractPdfText(buffer: Uint8Array, maxPages = 200): Promise<ExtractedDocument> {
  const loadingTask = pdfjs.getDocument({
    data: buffer.slice(),
    standardFontDataUrl: STANDARD_FONTS_URL.toString(),
    StandardFontDataFactory: NodeStandardFontDataFactory,
  })
  const pdf = await loadingTask.promise

  const meta = (await pdf.getMetadata().catch(() => null)) as
    | { info?: Record<string, string>; metadata?: { get?: (k: string) => string | undefined } }
    | null
  const pages: string[] = []

  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? (item.str as string) : ''))
      .filter(Boolean)
      .join(' ')
    pages.push(text)
  }

  const metadata: DocumentMetadata = {
    pages: pdf.numPages,
    title: meta?.info?.Title || meta?.metadata?.get?.('dc:title'),
    author: meta?.info?.Author || meta?.metadata?.get?.('dc:creator'),
    creationDate: meta?.info?.CreationDate,
  }

  return { text: pages.join('\n\n'), metadata }
}

export function needsOcr(result: ExtractedDocument, minChars = 40): boolean {
  return result.text.trim().length < minChars
}
