import { describe, afterEach, it, expect } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HttpError, jsonRequest } from './http-client'

let servers: Server[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
})

async function mockServer(handler: (req: IncomingMessage, body: string) => { status: number; json?: unknown; text?: string; retryAfter?: string }): Promise<string> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const result = handler(req, body)
      res.writeHead(result.status, {
        'content-type': 'application/json',
        ...(result.retryAfter ? { 'retry-after': result.retryAfter } : {}),
      })
      res.end(result.text ?? JSON.stringify(result.json ?? {}))
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

describe('jsonRequest', () => {
  it('envía POST con auth y cuerpo JSON', async () => {
    let seen = ''
    const baseUrl = await mockServer((req, body) => {
      seen = `${req.headers.authorization ?? ''}|${req.headers['content-type'] ?? ''}|${body}`
      return { status: 200, json: { ok: true } }
    })
    const result = await jsonRequest('/chat/completions', { baseUrl, apiKey: 'sk', body: { a: 1 } })
    expect(result).toEqual({ ok: true })
    expect(seen).toContain('Bearer sk')
    expect(seen).toContain('application/json')
    expect(seen).toContain('{"a":1}')
  })

  it('reintenta en 429 respetando retry-after', async () => {
    let attempts = 0
    const baseUrl = await mockServer((_req, _body) => {
      attempts += 1
      if (attempts < 3) return { status: 429, retryAfter: '0', json: { error: 'busy' } }
      return { status: 200, json: { done: true } }
    })
    const result = await jsonRequest('/chat/completions', { baseUrl, body: {} })
    expect(result).toEqual({ done: true })
    expect(attempts).toBe(3)
  })

  it('lanza HttpError con el cuerpo en errores no reintentables', async () => {
    const baseUrl = await mockServer(() => ({ status: 400, json: { error: { message: 'bad' } } }))
    await expect(jsonRequest('/chat/completions', { baseUrl, body: {} })).rejects.toMatchObject({
      status: 400,
      body: { error: { message: 'bad' } },
    })
  })

  it('lanza HttpError con estado HTTP 500 tras agotar reintentos', async () => {
    const baseUrl = await mockServer(() => ({ status: 500, json: {} }))
    await expect(jsonRequest('/chat/completions', { baseUrl, body: {}, maxRetries: 1 })).rejects.toBeInstanceOf(
      HttpError,
    )
  })
})
