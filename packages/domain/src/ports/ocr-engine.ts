import type { OCRHealth, OCRResult } from '../entities/ocr'

export interface OCRInput {
  buffer: Uint8Array
  mimeType: string
}

/**
 * Puerto OCR. La implementación (Tesseract en worker threads) lo realiza
 * @documind/ocr. El dominio solo consume resultados.
 */
export interface OCREngine {
  recognize(input: OCRInput, languages: string[]): Promise<OCRResult>
  health(): Promise<OCRHealth>
  /** Libera workers al cerrar la app. */
  dispose?(): Promise<void>
}
