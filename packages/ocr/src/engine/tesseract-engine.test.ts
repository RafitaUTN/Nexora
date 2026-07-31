import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OCRResult } from '@documind/domain'
import { TesseractOcrEngine } from './tesseract-engine'

type Handler = (...args: unknown[]) => void

const mocks = vi.hoisted(() => {
  const created: FakeWorker[] = []
  class FakeWorker {
    readonly messages: unknown[] = []
    private readonly handlers = new Map<string, Handler[]>()
    readonly terminate = vi.fn(async () => 0)
    constructor(
      readonly url: URL,
      readonly options: { workerData?: unknown } = {},
    ) {
      created.push(this)
    }
    on(event: string, cb: Handler): this {
      this.add(event, cb)
      return this
    }
    once(event: string, cb: Handler): this {
      this.add(event, cb)
      return this
    }
    off(event: string, cb: Handler): this {
      this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h !== cb))
      return this
    }
    postMessage(message: unknown): void {
      this.messages.push(message)
    }
    emit(event: string, payload?: unknown): void {
      for (const cb of [...(this.handlers.get(event) ?? [])]) cb(payload)
    }
    private add(event: string, cb: Handler): void {
      const list = this.handlers.get(event) ?? []
      list.push(cb)
      this.handlers.set(event, list)
    }
  }
  return { created, FakeWorker }
})

vi.mock('node:worker_threads', () => ({ Worker: mocks.FakeWorker }))

const okMessage = (text = 'texto ocr'): { ok: boolean; result: OCRResult } => ({
  ok: true,
  result: { text, confidence: 0.9, language: 'spa', pages: 1, engineVersion: '5.3' },
})

/** Emite 'online' en los workers creados (incluidos los que van naciendo) y deja correr microtasks. */
async function boot(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    for (const worker of mocks.created) worker.emit('online')
    await Promise.resolve()
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}

function postedBuffer(worker: { messages: unknown[] }): Uint8Array {
  const message = worker.messages[0] as { buffer: ArrayBuffer }
  return new Uint8Array(message.buffer)
}

function workerAt(index: number) {
  const worker = mocks.created[index]
  if (!worker) throw new Error(`worker ${index} no creado`)
  return worker
}

afterEach(() => {
  vi.clearAllMocks()
  mocks.created.length = 0
})

describe('TesseractOcrEngine', () => {
  it('crea el pool con maxWorkers y pasa workerData', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 3, langPath: '/lang', scaleFactor: 2 })
    void engine.recognize({ buffer: new Uint8Array(4), mimeType: 'image/png' }, ['spa'])
    await boot()
    expect(mocks.created).toHaveLength(3)
    for (const worker of mocks.created) {
      expect(worker.options.workerData).toMatchObject({
        langPath: '/lang',
        scaleFactor: 2,
        defaultLanguages: ['spa', 'eng'],
      })
    }
    await engine.dispose()
  })

  it('devuelve el resultado del worker y envÃ­a buffer, mimeType y lenguajes', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 1 })
    const pending = engine.recognize({ buffer: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }, ['eng'])
    await boot()
    const worker = workerAt(0)
    worker.emit('message', okMessage())
    const result = await pending
    expect(result).toMatchObject({ text: 'texto ocr', confidence: 0.9, pages: 1 })
    expect(postedBuffer(worker).join(',')).toBe('1,2,3')
    const message = worker.messages[0] as { mimeType: string; languages: string[] }
    expect(message.mimeType).toBe('image/png')
    expect(message.languages).toEqual(['eng'])
    await engine.dispose()
  })

  it('usa los lenguajes por defecto si no se indica ninguno', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 1, defaultLanguages: ['cat'] })
    const pending = engine.recognize({ buffer: new Uint8Array(2), mimeType: 'image/png' }, [])
    await boot()
    workerAt(0).emit('message', okMessage())
    await pending
    const message = workerAt(0).messages[0] as { languages: string[] }
    expect(message.languages).toEqual(['cat'])
    await engine.dispose()
  })

  it('encola tareas mientras los workers estÃ©n ocupados', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 1 })
    const first = engine.recognize({ buffer: new Uint8Array(1), mimeType: 'image/png' }, ['spa'])
    const second = engine.recognize({ buffer: new Uint8Array(1), mimeType: 'image/png' }, ['spa'])
    await boot()
    const worker = workerAt(0)
    expect(worker.messages).toHaveLength(1)
    worker.emit('message', okMessage('uno'))
    expect(await first).toMatchObject({ text: 'uno' })
    await settle()
    expect(worker.messages).toHaveLength(2)
    worker.emit('message', okMessage('dos'))
    expect(await second).toMatchObject({ text: 'dos' })
    await engine.dispose()
  })

  it('rechaza y pasa a la siguiente tarea cuando el worker falla', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 1 })
    const first = engine.recognize({ buffer: new Uint8Array(1), mimeType: 'image/png' }, ['spa'])
    const second = engine.recognize({ buffer: new Uint8Array(1), mimeType: 'image/png' }, ['spa'])
    await boot()
    const worker = workerAt(0)
    worker.emit('error', new Error('worker muerto'))
    await expect(first).rejects.toThrow('worker muerto')
    await settle()
    worker.emit('message', okMessage('siguiente'))
    expect(await second).toMatchObject({ text: 'siguiente' })
    await engine.dispose()
  })

  it('informa error OCR en el mensaje del worker como rejection', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 1 })
    const pending = engine.recognize({ buffer: new Uint8Array(1), mimeType: 'image/png' }, ['spa'])
    await boot()
    workerAt(0).emit('message', { ok: false, error: 'idioma no disponible' })
    await expect(pending).rejects.toThrow('idioma no disponible')
    await engine.dispose()
  })

  it('health devuelve ok con el tamaÃ±o del pool', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 2 })
    const first = engine.health()
    await boot()
    await first
    const health = await engine.health()
    expect(health).toEqual({ ok: true, engine: 'tesseract:2', error: null })
    await engine.dispose()
  })

  it('health devuelve error si falla la creaciÃ³n de workers', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 1 })
    const pending = engine.health()
    workerAt(0).emit('error', new Error('no hay tesseract'))
    const health = await pending
    expect(health).toEqual({ ok: false, engine: 'tesseract', error: 'no hay tesseract' })
  })

  it('dispose termina los workers y vacÃ­a el pool', async () => {
    const engine = new TesseractOcrEngine({ maxWorkers: 2 })
    void engine.recognize({ buffer: new Uint8Array(1), mimeType: 'image/png' }, ['spa'])
    await boot()
    await engine.dispose()
    for (const worker of mocks.created) expect(worker.terminate).toHaveBeenCalled()
  })
})
