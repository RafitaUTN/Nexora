import type { LicensePayload, LicenseServer } from '@documind/domain'
import { LicenseError } from '@documind/domain'

export interface HttpLicenseServerOptions {
  /** Base del servidor de licencias, p. ej. `https://licencias.ejemplo.com`. */
  baseUrl: string
  timeoutMs?: number
  /** Inyectable para tests (por defecto `globalThis.fetch`). */
  fetchFn?: typeof fetch
}

interface ErrorBody {
  error?: { code?: string; message?: string }
}

function errorCodeOf(status: number): LicenseError['code'] {
  if (status === 401 || status === 403) return 'ERR_LICENSE_REVOKED'
  if (status === 404 || status === 422) return 'ERR_LICENSE_INVALID_KEY'
  if (status >= 500) return 'ERR_LICENSE_SERVER'
  return 'ERR_LICENSE'
}

/**
 * Cliente HTTP del servidor de licencias online. Endpoints:
 * - POST /v1/licenses/activate { key, deviceId } → { payload, signature }
 * - POST /v1/licenses/deactivate { deviceId } → 204
 * Los errores HTTP se traducen a códigos de negocio (`LicenseError`).
 */
export class HttpLicenseServer implements LicenseServer {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchFn: typeof fetch

  constructor(options: HttpLicenseServerOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.fetchFn = options.fetchFn ?? globalThis.fetch
  }

  async activate(key: string, deviceId: string): Promise<{ payload: LicensePayload; signature: string }> {
    const body = await this.post<{ payload: LicensePayload; signature: string }>(
      '/v1/licenses/activate',
      { key, deviceId },
    )
    return { payload: body.payload, signature: body.signature }
  }

  async deactivate(deviceId: string): Promise<void> {
    await this.post<undefined>('/v1/licenses/deactivate', { deviceId })
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch {
      const aborted = controller.signal.aborted
      throw new LicenseError(
        aborted
          ? 'El servidor de licencias no respondió a tiempo'
          : 'No se pudo conectar con el servidor de licencias',
        aborted ? 'ERR_LICENSE_SERVER' : 'ERR_LICENSE_NETWORK',
      )
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 204) return undefined as T
    if (response.ok) return (await response.json()) as T

    let message = `El servidor rechazó la petición (${response.status})`
    try {
      const data = (await response.json()) as ErrorBody
      if (data.error?.message) message = data.error.message
    } catch {
      // Respuesta de error sin cuerpo JSON
    }
    throw new LicenseError(message, errorCodeOf(response.status))
  }
}
