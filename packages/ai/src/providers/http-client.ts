export interface JsonHttpOptions {
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
  timeoutMs?: number
  maxRetries?: number
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Cliente HTTP mínimo para proveedores de IA: timeout, reintentos con
 * backoff y mapeo de errores (incluye rate-limit 429).
 */
export async function jsonRequest(
  path: string,
  options: JsonHttpOptions & {
    method?: 'POST' | 'GET'
    body?: unknown
  },
): Promise<unknown> {
  const { baseUrl, apiKey, headers, timeoutMs = 30_000, maxRetries = 2, method = 'POST', body } = options

  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let attempts = 0

  try {
    for (;;) {
      attempts += 1
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        })

        const text = await res.text()
        const parsed = text ? safeJson(text) : undefined

        if (res.ok) return parsed

        if (res.status === 429 && attempts <= maxRetries) {
          const retryAfter = Number(res.headers.get('retry-after') ?? '1')
          await delay(Math.min(retryAfter * 1000, 5_000))
          continue
        }
        if (res.status >= 500 && attempts <= maxRetries) {
          await delay(300 * attempts)
          continue
        }
        throw new HttpError(`HTTP ${res.status} en ${path}`, res.status, parsed)
      } catch (error) {
        if (error instanceof HttpError) throw error
        if (attempts <= maxRetries) {
          await delay(300 * attempts)
          continue
        }
        throw error
      }
    }
  } finally {
    clearTimeout(timer)
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
