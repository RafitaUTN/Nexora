import { stat } from 'node:fs/promises'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { OcrLanguageInfo, OcrLanguageProgress, OcrLanguageUpdate } from '@documind/domain'
import { OCR_LANGUAGE_CATALOG, type OcrLanguage } from './catalog'

/** URL base de los paquetes de datos (Tesseract LSTM, OEM 1). */
const CDN_ROOT = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data'
/** Etiqueta del paquete: misma que usa el worker (4.0.0_best_int). */
const PACKAGE_TAG = '4.0.0_best_int'
/** API de jsDelivr para consultar la última versión de un paquete. */
const META_URL = 'https://data.jsdelivr.com/v1/packages/npm/@tesseract.js-data'
const MANIFEST_FILE = 'manifest.json'
/** Un paquete válido nunca es tan pequeño (solo la cabecera gzip). */
const MIN_LANG_BYTES = 50_000

export interface OcrLoggerLike {
  info?(message: string, meta?: unknown): void
  warn?(message: string, meta?: unknown): void
}

export interface OcrLanguageManagerOptions {
  /** Directorio donde viven los paquetes (`${code}.traineddata.gz`). */
  langPath: string
  logger?: OcrLoggerLike
  /** Se inyecta en los tests. */
  fetchImpl?: typeof fetch
}

interface ManifestEntry {
  version: string
  sizeBytes: number
  installedAt: string
}

export class OcrLanguageError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'OcrLanguageError'
  }
}

const languageFile = (code: string): string => `${code}.traineddata.gz`

/**
 * Gestiona los paquetes de idioma OCR: catálogo, descarga con progreso,
 * instalación local (validada) y comprobación de actualizaciones. Los
 * códigos de idioma son internos; la UI consume nombres legibles.
 */
export class OcrLanguageManager {
  private readonly fetchImpl: typeof fetch
  private readonly logger?: OcrLoggerLike

  constructor(private readonly options: OcrLanguageManagerOptions) {
    this.logger = options.logger
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args))
  }

  get langPath(): string {
    return this.options.langPath
  }

  language(code: string): OcrLanguage | undefined {
    return OCR_LANGUAGE_CATALOG.find((lang) => lang.code === code)
  }

  async isInstalled(code: string): Promise<boolean> {
    try {
      const info = await stat(join(this.langPath, languageFile(code)))
      return info.size >= MIN_LANG_BYTES
    } catch {
      return false
    }
  }

  async installedVersion(code: string): Promise<string | null> {
    const manifest = await this.readManifest()
    return manifest[code]?.version ?? null
  }

  /** Catálogo completo con el estado de instalación/activación. */
  async list(activeCodes: string[]): Promise<OcrLanguageInfo[]> {
    const active = new Set(activeCodes)
    const manifest = await this.readManifest()
    const installed = new Set(await this.listInstalledCodes())
    const entries: OcrLanguageInfo[] = OCR_LANGUAGE_CATALOG.map((lang) => ({
      ...lang,
      installed: installed.has(lang.code),
      version: manifest[lang.code]?.version ?? null,
      active: active.has(lang.code),
      updateAvailable: false,
    }))
    // Códigos activos heredados que ya no están en el catálogo: se conservan
    // para no romper configuraciones existentes.
    for (const code of active) {
      if (!OCR_LANGUAGE_CATALOG.some((lang) => lang.code === code)) {
        entries.push({
          code,
          name: code,
          nativeName: '',
          preinstalled: false,
          installed: installed.has(code),
          version: manifest[code]?.version ?? null,
          active: true,
          updateAvailable: false,
        })
      }
    }
    return entries
  }

  /** Descarga (con progreso), valida e instala un idioma. */
  async install(code: string, onProgress?: (p: OcrLanguageProgress) => void): Promise<void> {
    const url = `${CDN_ROOT}/${code}/${PACKAGE_TAG}/${languageFile(code)}`
    const response = await this.fetchImpl(url)
    if (!response.ok || !response.body) {
      throw new OcrLanguageError(`No se pudo descargar el idioma (código ${response.status})`, code)
    }
    const total = Number(response.headers.get('content-length') ?? 0)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    onProgress?.({ code, progress: 0, status: 'downloading' })
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        received += value.length
        if (total > 0) {
          onProgress?.({ code, progress: Math.min(1, received / total), status: 'downloading' })
        }
      }
    }
    const buffer = Buffer.concat(chunks)
    if (buffer.length < MIN_LANG_BYTES) {
      throw new OcrLanguageError('El archivo de idioma está vacío o incompleto', code)
    }
    if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
      throw new OcrLanguageError('El archivo de idioma no es válido', code)
    }
    await mkdir(this.langPath, { recursive: true })
    const tmp = join(this.langPath, `${languageFile(code)}.tmp`)
    await writeFile(tmp, buffer)
    await rename(tmp, join(this.langPath, languageFile(code)))
    await this.updateManifest(code, {
      version: PACKAGE_TAG,
      sizeBytes: buffer.length,
      installedAt: new Date().toISOString(),
    })
    onProgress?.({ code, progress: 1, status: 'done' })
  }

  /** Elimina un idioma instalado localmente. */
  async remove(code: string): Promise<void> {
    await rm(join(this.langPath, languageFile(code)), { force: true })
    await this.updateManifest(code, null)
  }

  /**
   * Descarga en segundo plano los idiomas preinstalados que falten. Nunca
   * lanza: un fallo de red solo queda registrado.
   */
  async ensurePreinstalled(onProgress?: (p: OcrLanguageProgress) => void): Promise<void> {
    const missing: OcrLanguage[] = []
    for (const lang of OCR_LANGUAGE_CATALOG) {
      if (lang.preinstalled && !(await this.isInstalled(lang.code))) missing.push(lang)
    }
    for (const lang of missing) {
      try {
        this.logger?.info?.(`Preinstalando idioma OCR: ${lang.name}`)
        await this.install(lang.code, onProgress)
      } catch (error) {
        this.logger?.warn?.(`No se pudo preinstalar ${lang.name}`, { error: String(error) })
      }
    }
  }

  /** Consulta la última versión de cada idioma instalado. */
  async checkForUpdates(): Promise<OcrLanguageUpdate[]> {
    const manifest = await this.readManifest()
    const updates: OcrLanguageUpdate[] = []
    for (const [code, entry] of Object.entries(manifest)) {
      try {
        const latest = await this.fetchLatestVersion(code)
        if (latest && latest !== entry.version) {
          updates.push({ code, currentVersion: entry.version, latestVersion: latest })
        }
      } catch (error) {
        this.logger?.warn?.(`No se pudo consultar versiones de ${code}`, { error: String(error) })
      }
    }
    return updates
  }

  private async fetchLatestVersion(code: string): Promise<string | null> {
    const response = await this.fetchImpl(`${META_URL}/${code}`)
    if (!response.ok) return null
    const body = (await response.json()) as { tags?: Record<string, string> }
    return body.tags?.latest ?? null
  }

  private async listInstalledCodes(): Promise<string[]> {
    let entries: string[]
    try {
      entries = await readdir(this.langPath)
    } catch {
      return []
    }
    return entries
      .filter((name) => name.endsWith('.traineddata.gz'))
      .map((name) => name.slice(0, -'.traineddata.gz'.length))
  }

  private async readManifest(): Promise<Record<string, ManifestEntry>> {
    try {
      const raw = await readFile(join(this.langPath, MANIFEST_FILE), 'utf8')
      return JSON.parse(raw) as Record<string, ManifestEntry>
    } catch {
      return {}
    }
  }

  private async writeManifest(manifest: Record<string, ManifestEntry>): Promise<void> {
    await mkdir(this.langPath, { recursive: true })
    await writeFile(join(this.langPath, MANIFEST_FILE), JSON.stringify(manifest, null, 2))
  }

  private async updateManifest(code: string, entry: ManifestEntry | null): Promise<void> {
    const manifest = await this.readManifest()
    if (entry === null) delete manifest[code]
    else manifest[code] = entry
    await this.writeManifest(manifest)
  }
}
