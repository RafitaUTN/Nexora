import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFile } from 'node:fs/promises'
import type { ExtractedDocument } from '../types'

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

/**
 * Rasteriza PDFs escaneados a imágenes PNG para alimentar el OCR.
 * Usa pdfjs-dist + @napi-rs/canvas (render offscreen en Node).
 * Devuelve un ExtractedDocument sin texto pero con `images` (PNG por página).
 */
export async function rasterizePdfToImages(buffer: Uint8Array, maxPages = 20, scale = 2): Promise<ExtractedDocument> {
  const canvasModule = await import('@napi-rs/canvas')
  const loadingTask = pdfjs.getDocument({
    data: buffer.slice(),
    standardFontDataUrl: STANDARD_FONTS_URL.toString(),
    StandardFontDataFactory: NodeStandardFontDataFactory,
  })
  const pdf = await loadingTask.promise

  const images: Uint8Array[] = []
  const pagesToRender = Math.min(pdf.numPages, maxPages)

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = canvasModule.createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    images.push(new Uint8Array(canvas.toBuffer('image/png')))
  }

  return {
    text: '',
    metadata: { pages: pdf.numPages, rasterizedPages: pagesToRender },
    images,
  }
}
