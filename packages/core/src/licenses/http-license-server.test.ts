import { describe, expect, it, vi } from 'vitest'
import { HttpLicenseServer } from './http-license-server'
import type { LicenseError } from '@documind/domain'
import type { LicensePayload } from '@documind/domain'

const payload: LicensePayload = {
  keySha256: 'hash',
  tier: 'pro',
  deviceId: 'device-1',
  activatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  maxDevices: 3,
}

type FetchMock = (url: string, init?: RequestInit) => Promise<Response>

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function setup(fetchImpl: FetchMock) {
  const server = new HttpLicenseServer({ baseUrl: 'https://lic.test/', fetchFn: fetchImpl as typeof fetch })
  return server
}

describe('HttpLicenseServer', () => {
  it('activa y devuelve la carga firmada', async () => {
    const fetchFn = vi.fn<FetchMock>(async () => jsonResponse(200, { payload, signature: 'sig' }))
    const server = setup(fetchFn as unknown as typeof fetch)
    const result = await server.activate('ABCD-1234', 'device-1')
    expect(result).toEqual({ payload, signature: 'sig' })
    const call = fetchFn.mock.calls[0]
    expect(call).toBeDefined()
    const [url, init] = call as [string, RequestInit?]
    expect(url).toBe('https://lic.test/v1/licenses/activate')
    expect(JSON.parse(String(init?.body))).toEqual({ key: 'ABCD-1234', deviceId: 'device-1' })
  })

  it('desactiva con 204', async () => {
    const fetchFn = vi.fn<FetchMock>(async () => new Response(null, { status: 204 }))
    const server = setup(fetchFn as unknown as typeof fetch)
    await expect(server.deactivate('device-1')).resolves.toBeUndefined()
  })

  it('traduce 401/403 a revocada', async () => {
    const fetchFn = vi.fn<FetchMock>(async () => jsonResponse(401, { error: { message: 'Clave revocada' } }))
    const server = setup(fetchFn as unknown as typeof fetch)
    await expect(server.activate('x', 'y')).rejects.toMatchObject({ code: 'ERR_LICENSE_REVOKED' })
  })

  it('traduce 404/422 a clave inválida', async () => {
    const fetchFn = vi.fn<FetchMock>(async () => jsonResponse(422, { error: { message: 'Clave no encontrada' } }))
    const server = setup(fetchFn as unknown as typeof fetch)
    await expect(server.activate('x', 'y')).rejects.toMatchObject({ code: 'ERR_LICENSE_INVALID_KEY' })
  })

  it('traduce 5xx a error de servidor', async () => {
    const fetchFn = vi.fn<FetchMock>(async () => jsonResponse(500, {}))
    const server = setup(fetchFn as unknown as typeof fetch)
    await expect(server.activate('x', 'y')).rejects.toMatchObject({ code: 'ERR_LICENSE_SERVER' })
  })

  it('traduce fallo de red a error de conexión', async () => {
    const fetchFn = vi.fn<FetchMock>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const server = setup(fetchFn as unknown as typeof fetch)
    await expect(server.activate('x', 'y')).rejects.toMatchObject({ code: 'ERR_LICENSE_NETWORK' })
  })

  it('traduce timeout (abort) a error de servidor', async () => {
    const fetchFn = vi.fn(
      async (_url: string, init?: RequestInit): Promise<Response> => {
        const signal = init?.signal as AbortSignal
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
        return new Response(null, { status: 500 })
      },
    )
    const server = new HttpLicenseServer({ baseUrl: 'https://lic.test/', timeoutMs: 5, fetchFn: fetchFn as unknown as typeof fetch })
    await expect(server.activate('x', 'y')).rejects.toMatchObject({ code: 'ERR_LICENSE_SERVER' })
  })

  it('expone el mensaje de error del servidor', async () => {
    const fetchFn = vi.fn<FetchMock>(async () => jsonResponse(422, { error: { message: 'Formato incorrecto' } }))
    const server = setup(fetchFn as unknown as typeof fetch)
    const error = (await server.activate('x', 'y').catch((e: unknown) => e)) as LicenseError
    expect(error.message).toContain('Formato incorrecto')
  })
})
