import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import Tesseract from 'tesseract.js'

type TessWorker = Tesseract.Worker

interface WorkerData {
  langPath?: string
  scaleFactor?: number
  defaultLanguages: string[]
}

const data = workerData as WorkerData

let tessWorker: TessWorker | null = null
let createTask: Promise<TessWorker> | null = null
let localMode = false

const langFile = (lang: string): string => join(data.langPath ?? '', `${lang}.traineddata.gz`)

/**
 * True si todos los idiomas pedidos están disponibles en el langPath local.
 * Si no, el worker usa el CDN de Tesseract para ese idioma (modo red).
 */
function allLocal(langs: string[]): boolean {
  return data.langPath !== undefined && langs.every((lang) => existsSync(langFile(lang)))
}

async function getWorker(useLocal: boolean): Promise<TessWorker> {
  if (tessWorker && localMode === useLocal) return tessWorker
  if (createTask) {
    const existing = await createTask
    if (localMode === useLocal) return existing
  }
  createTask = (async () => {
    try {
      if (tessWorker) {
        await tessWorker.terminate()
        tessWorker = null
      }
      tessWorker = await Tesseract.createWorker(data.defaultLanguages, 1, {
        ...(useLocal && data.langPath ? { langPath: data.langPath } : {}),
        logger: () => undefined,
      })
      localMode = useLocal
      return tessWorker
    } finally {
      createTask = null
    }
  })()
  return createTask
}

interface JobMessage {
  buffer: ArrayBuffer
  languages: string[]
}

parentPort?.on('message', async (message: JobMessage) => {
  try {
    const worker = await getWorker(allLocal(message.languages))
    if (message.languages.join(',') !== data.defaultLanguages.join(',')) {
      await worker.reinitialize(message.languages.join('+'), 1)
    }
    const { data: result } = await worker.recognize(new Uint8Array(message.buffer))
    const raw = typeof result.confidence === 'number' ? result.confidence / 100 : 0
    parentPort?.postMessage({
      ok: true,
      result: {
        text: result.text ?? '',
        confidence: Math.max(0, Math.min(1, raw)),
        language: message.languages.join('+'),
        pages: 1,
        engineVersion: result.version ?? null,
      },
    })
  } catch (error) {
    parentPort?.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
