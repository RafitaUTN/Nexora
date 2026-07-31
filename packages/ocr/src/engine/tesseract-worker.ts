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
let loading: Promise<TessWorker> | null = null

async function getWorker(): Promise<TessWorker> {
  if (tessWorker) return tessWorker
  if (!loading) {
    loading = (async () => {
      const w = await Tesseract.createWorker(data.defaultLanguages, 1, {
        ...(data.langPath ? { langPath: data.langPath } : {}),
        logger: () => undefined,
      })
      tessWorker = w
      return w
    })()
  }
  return loading
}

interface JobMessage {
  buffer: ArrayBuffer
  languages: string[]
}

parentPort?.on('message', async (message: JobMessage) => {
  try {
    const worker = await getWorker()
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
