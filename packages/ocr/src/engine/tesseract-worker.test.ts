import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

const mocks = vi.hoisted(() => {
  const postMessage = vi.fn()
  const createWorker = vi.fn()
  const existsSync = vi.fn()
  const parentPort = { on: vi.fn(), postMessage }
  const workerData = {
    langPath: '/lang',
    scaleFactor: 2,
    defaultLanguages: ['spa', 'eng'],
  }
  return { postMessage, createWorker, existsSync, parentPort, workerData }
})

vi.mock('node:worker_threads', () => ({
  parentPort: mocks.parentPort,
  workerData: mocks.workerData,
}))

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
}))

vi.mock('tesseract.js', () => ({
  default: { createWorker: mocks.createWorker },
  createWorker: mocks.createWorker,
}))

type MessageHandler = (message: { buffer: ArrayBuffer; languages: string[] }) => void | Promise<void>

/** Reimporta el worker con módulos limpios y devuelve su handler de 'message'. */
async function loadHandler(): Promise<MessageHandler> {
  await import('./tesseract-worker')
  const registered = mocks.parentPort.on.mock.calls.find(([event]) => event === 'message') ?? []
  return registered[1] as MessageHandler
}

function makeTesseractWorker(): { reinitialize: Mock; recognize: Mock } {
  const fake = { reinitialize: vi.fn(async () => undefined), recognize: vi.fn() }
  mocks.createWorker.mockResolvedValue(fake)
  return fake
}

beforeEach(() => {
  vi.resetModules()
  mocks.parentPort.on.mockClear()
  mocks.postMessage.mockClear()
  mocks.createWorker.mockReset()
  mocks.existsSync.mockImplementation((path: unknown) => String(path).endsWith('.traineddata.gz'))
})

const job = { buffer: new ArrayBuffer(8), languages: ['spa', 'eng'] }

describe('tesseract-worker', () => {
  it('procesa un mensaje y devuelve el texto con confianza normalizada', async () => {
    const fake = makeTesseractWorker()
    fake.recognize.mockResolvedValue({
      data: { text: 'hola mundo', confidence: 92, version: '5.3.0' },
    })
    const handler = await loadHandler()
    await handler(job)
    expect(mocks.createWorker).toHaveBeenCalledWith(['spa', 'eng'], 1, {
      langPath: '/lang',
      logger: expect.any(Function),
    })
    expect(fake.reinitialize).not.toHaveBeenCalled()
    expect(mocks.postMessage).toHaveBeenCalledWith({
      ok: true,
      result: { text: 'hola mundo', confidence: 0.92, language: 'spa+eng', pages: 1, engineVersion: '5.3.0' },
    })
  })

  it('re-inicializa el worker si cambia el idioma', async () => {
    const fake = makeTesseractWorker()
    fake.recognize.mockResolvedValue({ data: { text: 'x', confidence: 50, version: null } })
    const handler = await loadHandler()
    await handler({ buffer: new ArrayBuffer(4), languages: ['eng'] })
    expect(fake.reinitialize).toHaveBeenCalledWith('eng', 1)
    expect(mocks.postMessage).toHaveBeenCalledWith({
      ok: true,
      result: { text: 'x', confidence: 0.5, language: 'eng', pages: 1, engineVersion: null },
    })
  })

  it('clampa la confianza fuera de rango [0, 1]', async () => {
    const fake = makeTesseractWorker()
    fake.recognize
      .mockResolvedValueOnce({ data: { text: 'a', confidence: 250 } })
      .mockResolvedValueOnce({ data: { text: 'b', confidence: -20 } })
    const handler = await loadHandler()
    await handler(job)
    await handler(job)
    const sent = mocks.postMessage.mock.calls.map(
      ([msg]) => (msg as { result: { confidence: number } }).result.confidence,
    )
    expect(sent[0]).toBe(1)
    expect(sent[1]).toBe(0)
  })

  it('devuelve ok:false si Tesseract falla', async () => {
    const fake = makeTesseractWorker()
    fake.recognize.mockRejectedValue(new Error('tesseract no responde'))
    const handler = await loadHandler()
    await handler(job)
    expect(mocks.postMessage).toHaveBeenCalledWith({ ok: false, error: 'tesseract no responde' })
  })

  it('usa el CDN (sin langPath) si los idiomas no están instalados localmente', async () => {
    const fake = makeTesseractWorker()
    mocks.existsSync.mockReturnValue(false)
    fake.recognize.mockResolvedValue({ data: { text: 'x', confidence: 90, version: null } })
    const handler = await loadHandler()
    await handler(job)
    expect(mocks.createWorker).toHaveBeenCalledWith(['spa', 'eng'], 1, {
      logger: expect.any(Function),
    })
    expect(mocks.postMessage).toHaveBeenCalledWith({
      ok: true,
      result: { text: 'x', confidence: 0.9, language: 'spa+eng', pages: 1, engineVersion: null },
    })
  })

  it('cambia de modo (local a CDN) al cambiar de idioma no instalado', async () => {
    const fake = makeTesseractWorker()
    fake.recognize.mockResolvedValue({ data: { text: 'x', confidence: 80, version: null } })
    const handler = await loadHandler()
    mocks.existsSync.mockImplementation((path: unknown) => {
      const p = String(path)
      return p.endsWith('.traineddata.gz') && !p.includes('cat')
    })
    await handler({ buffer: new ArrayBuffer(4), languages: ['cat'] })
    const options = mocks.createWorker.mock.calls[0]?.[2]
    expect(options).not.toHaveProperty('langPath')
    expect(fake.reinitialize).toHaveBeenCalledWith('cat', 1)
  })
})
