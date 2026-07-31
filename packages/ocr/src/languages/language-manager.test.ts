import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OcrLanguageProgress } from '@documind/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OcrLanguageManager } from './language-manager'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ocr-langs-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function gzipBuffer(size = 60_000): Buffer {
  const buf = Buffer.alloc(size)
  buf[0] = 0x1f
  buf[1] = 0x8b
  return buf
}

function responseOf(buffer: Buffer, status = 200, headers: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const chunk = 16 * 1024
      for (let i = 0; i < buffer.length; i += chunk) {
        controller.enqueue(buffer.subarray(i, i + chunk))
      }
      controller.close()
    },
  })
  return new Response(stream, { status, headers: { 'content-length': String(buffer.length), ...headers } })
}

function makeManager(fetchImpl: typeof fetch = vi.fn() as never): OcrLanguageManager {
  return new OcrLanguageManager({ langPath: dir, fetchImpl })
}

describe('OcrLanguageManager', () => {
  it('lista el catálogo con estado de instalación y activación', async () => {
    const manager = makeManager()
    const list = await manager.list(['spa', 'eng'])
    const spa = list.find((l) => l.code === 'spa')
    expect(spa).toMatchObject({
      name: 'Español',
      preinstalled: true,
      installed: false,
      active: true,
      updateAvailable: false,
    })
    expect(list.find((l) => l.code === 'cat')).toMatchObject({ preinstalled: false, active: false })
  })

  it('instala un idioma: descarga, valida, escribe y emite progreso', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      responseOf(gzipBuffer(), 200, { 'content-length': '60000' }),
    )
    const manager = makeManager(fetchMock as never)
    const progress: OcrLanguageProgress[] = []
    await manager.install('spa', (p) => progress.push(p))

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/spa/4.0.0_best_int/spa.traineddata.gz'))
    const file = await readFile(join(dir, 'spa.traineddata.gz'))
    expect(file.length).toBe(60_000)
    expect(file[0]).toBe(0x1f)
    expect(progress.at(-1)).toMatchObject({ code: 'spa', status: 'done', progress: 1 })
    expect(await manager.isInstalled('spa')).toBe(true)
    expect(await manager.installedVersion('spa')).not.toBeNull()
  })

  it('rechaza una respuesta no 200', async () => {
    const fetchMock = vi.fn(async () => new Response('no', { status: 404 }))
    const manager = makeManager(fetchMock as never)
    await expect(manager.install('spa')).rejects.toThrow('No se pudo descargar')
    expect(await manager.isInstalled('spa')).toBe(false)
  })

  it('rechaza un archivo que no es gzip', async () => {
    const fetchMock = vi.fn(async () => responseOf(Buffer.alloc(60_000)))
    const manager = makeManager(fetchMock as never)
    await expect(manager.install('spa')).rejects.toThrow('no es válido')
  })

  it('rechaza un archivo demasiado pequeño', async () => {
    const fetchMock = vi.fn(async () => responseOf(gzipBuffer(1_000)))
    const manager = makeManager(fetchMock as never)
    await expect(manager.install('spa')).rejects.toThrow('incompleto')
  })

  it('elimina un idioma y limpia el manifiesto', async () => {
    const fetchMock = vi.fn(async () => responseOf(gzipBuffer()))
    const manager = makeManager(fetchMock as never)
    await manager.install('fra')
    expect(await manager.isInstalled('fra')).toBe(true)
    await manager.remove('fra')
    expect(await manager.isInstalled('fra')).toBe(false)
    expect(await manager.installedVersion('fra')).toBeNull()
  })

  it('ensurePreinstalled solo descarga los idiomas preinstalados que faltan', async () => {
    const fetchMock = vi.fn(async (_url: string) => responseOf(gzipBuffer()))
    const manager = makeManager(fetchMock as never)
    await manager.install('spa')
    const before = fetchMock.mock.calls.length
    await manager.ensurePreinstalled()
    const calls = fetchMock.mock.calls.slice(before).map(([url]) => String(url))
    expect(calls).not.toContain(expect.stringContaining('/spa/'))
    for (const code of ['eng', 'por', 'fra', 'deu', 'ita']) {
      expect(calls).toContainEqual(expect.stringContaining(`/${code}/`))
    }
    expect(await manager.isInstalled('eng')).toBe(true)
    expect(await manager.isInstalled('ita')).toBe(true)
  })

  it('checkForUpdates notifica versiones más recientes', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('data.jsdelivr.com')) {
        return new Response(JSON.stringify({ tags: { latest: '9.9.9' } }), { status: 200 })
      }
      return responseOf(gzipBuffer())
    })
    const manager = makeManager(fetchMock as never)
    await manager.install('deu')
    const updates = await manager.checkForUpdates()
    expect(updates).toEqual([
      expect.objectContaining({ code: 'deu', currentVersion: '4.0.0_best_int', latestVersion: '9.9.9' }),
    ])
  })

  it('checkForUpdates devuelve vacío si la versión es la última', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('data.jsdelivr.com')) {
        return new Response(JSON.stringify({ tags: { latest: '4.0.0_best_int' } }), { status: 200 })
      }
      return responseOf(gzipBuffer())
    })
    const manager = makeManager(fetchMock as never)
    await manager.install('deu')
    expect(await manager.checkForUpdates()).toEqual([])
  })

  it('conserva códigos activos heredados fuera del catálogo', async () => {
    const manager = makeManager()
    const list = await manager.list(['xxt'])
    expect(list.find((l) => l.code === 'xxt')).toMatchObject({ active: true, installed: false })
  })

  it('list no incluye archivos basura del directorio', async () => {
    const fetchMock = vi.fn(async () => responseOf(gzipBuffer()))
    const manager = makeManager(fetchMock as never)
    await manager.install('ita')
    const entries = await readdir(dir)
    expect(entries).toContain('ita.traineddata.gz')
    expect(entries).toContain('manifest.json')
    const list = await manager.list([])
    expect(list.filter((l) => l.installed).map((l) => l.code)).toEqual(['ita'])
  })
})
