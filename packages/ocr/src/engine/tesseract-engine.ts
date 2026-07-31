import { Worker, type WorkerOptions } from 'node:worker_threads'
import type { OCRInput, OCRResult, OCRHealth, OCREngine } from '@documind/domain'

export interface TesseractOcrEngineOptions {
  /** Idiomas por defecto si no se indica ninguno (códigos ISO 639-1). */
  defaultLanguages?: string[]
  /** Tamaño del pool de workers. */
  maxWorkers?: number
  /** Semilla de datos para Tesseract.js (langPath). */
  langPath?: string
  /** Factor de redimensión de imagen para acelerar (1 = sin escala). */
  scaleFactor?: number
}

interface PoolWorker {
  worker: Worker
  busy: boolean
}

/**
 * Motor OCR basado en Tesseract.js que mantiene un pool de worker threads.
 * Cada tarea encola y se asigna a un worker libre; evita bloquear el hilo
 * principal de Electron.
 */
export class TesseractOcrEngine implements OCREngine {
  private readonly defaultLanguages: string[]
  private readonly maxWorkers: number
  private readonly langPath?: string
  private readonly scaleFactor: number
  private pool: PoolWorker[] = []
  private queue: Array<{
    resolve: (r: OCRResult) => void
    reject: (e: Error) => void
    input: OCRInput
    languages: string[]
  }> = []

  constructor(options: TesseractOcrEngineOptions = {}) {
    this.defaultLanguages = options.defaultLanguages ?? ['spa', 'eng']
    this.maxWorkers = options.maxWorkers ?? 2
    this.langPath = options.langPath
    this.scaleFactor = options.scaleFactor ?? 1
  }

  async recognize(input: OCRInput, languages: string[]): Promise<OCRResult> {
    await this.ensureWorkers()
    const langs = languages.length > 0 ? languages : this.defaultLanguages
    return new Promise<OCRResult>((resolve, reject) => {
      this.queue.push({ resolve, reject, input, languages: langs })
      this.dispatch()
    })
  }

  async health(): Promise<OCRHealth> {
    try {
      await this.ensureWorkers()
      return { ok: true, engine: `tesseract:${this.pool.length}`, error: null }
    } catch (error) {
      return { ok: false, engine: 'tesseract', error: error instanceof Error ? error.message : String(error) }
    }
  }

  async dispose(): Promise<void> {
    const workers = this.pool.map((slot) => slot.worker)
    this.pool = []
    await Promise.allSettled(workers.map((w) => w.terminate()))
  }

  private async ensureWorkers(): Promise<void> {
    if (this.pool.length === 0) {
      const count = Math.max(1, this.maxWorkers)
      for (let i = 0; i < count; i++) {
        this.pool.push({ worker: await this.spawnWorker(), busy: false })
      }
    }
  }

  private spawnWorker(): Promise<Worker> {
    return new Promise<Worker>((resolve, reject) => {
      const worker = new Worker(new URL('./tesseract-worker.js', import.meta.url), {
        workerData: {
          langPath: this.langPath,
          scaleFactor: this.scaleFactor,
          defaultLanguages: this.defaultLanguages,
        },
      } satisfies WorkerOptions)
      worker.once('online', () => resolve(worker))
      worker.once('error', reject)
    })
  }

  private dispatch(): void {
    for (const slot of this.pool) {
      if (slot.busy) continue
      const job = this.queue.shift()
      if (!job) return
      slot.busy = true
      this.runJob(slot, job)
    }
  }

  private runJob(
    slot: PoolWorker,
    job: { resolve: (r: OCRResult) => void; reject: (e: Error) => void; input: OCRInput; languages: string[] },
  ): void {
    const onMessage = (message: { ok: boolean; result?: OCRResult; error?: string }): void => {
      slot.worker.off('message', onMessage)
      slot.worker.off('error', onError)
      slot.busy = false
      if (message.ok && message.result) job.resolve(message.result)
      else job.reject(new Error(message.error ?? 'Error OCR desconocido'))
      this.dispatch()
    }
    const onError = (err: Error): void => {
      slot.worker.off('message', onMessage)
      slot.worker.off('error', onError)
      slot.busy = false
      job.reject(err)
      this.dispatch()
    }
    slot.worker.on('message', onMessage)
    slot.worker.on('error', onError)
    slot.worker.postMessage({
      buffer: job.input.buffer.buffer,
      mimeType: job.input.mimeType,
      languages: job.languages,
    })
  }
}
