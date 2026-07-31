import { z } from 'zod'

export const ocrResultSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  language: z.string(),
  pages: z.number().int().min(1),
  engineVersion: z.string().nullable(),
})
export type OCRResult = z.infer<typeof ocrResultSchema>

export const ocrHealthSchema = z.object({
  ok: z.boolean(),
  engine: z.string(),
  error: z.string().nullable(),
})
export type OCRHealth = z.infer<typeof ocrHealthSchema>

/** Idioma OCR visto desde la UI. El código interno nunca se muestra al usuario. */
export interface OcrLanguageInfo {
  /** Código interno de Tesseract (spa, eng, …). No se expone en la UI. */
  code: string
  /** Nombre legible en español. */
  name: string
  /** Nombre nativo del idioma. */
  nativeName: string
  /** Se descarga automáticamente en la primera ejecución. */
  preinstalled: boolean
  /** El paquete de datos está disponible localmente. */
  installed: boolean
  /** Versión del paquete instalado, si lo hay. */
  version: string | null
  /** Activado en los ajustes (se usa para OCR). */
  active: boolean
  /** Hay una versión más reciente disponible (tras checkForUpdates). */
  updateAvailable: boolean
}

export interface OcrLanguageProgress {
  code: string
  /** Progreso 0..1. */
  progress: number
  status: 'downloading' | 'done' | 'error'
  error?: string
}

export interface OcrLanguageUpdate {
  code: string
  currentVersion: string | null
  latestVersion: string
}
