import { describe, afterEach, it, expect } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { OpenAiProvider } from './openai'

let servers: Server[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
})

async function mockServer(handler: (req: IncomingMessage, body: string) => { status: number; json: unknown }): Promise<string> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const result = handler(req, body)
      res.writeHead(result.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(result.json))
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

describe('OpenAiProvider contra mock server', () => {
  it('envía chat/completions con auth y devuelve contenido y uso', async () => {
    let seenAuth = ''
    const baseUrl = await mockServer((req, body) => {
      seenAuth = req.headers.authorization ?? ''
      const parsed = JSON.parse(body)
      return {
        status: 200,
        json: {
          choices: [{ message: { content: '{"category":"factura"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: parsed.model,
        },
      }
    })
    const provider = new OpenAiProvider({ id: 'openai', apiKey: 'sk-test', baseUrl, defaultModel: 'gpt-4o-mini' })
    const response = await provider.chat({ messages: [{ role: 'user', content: 'clasifica' }] })
    expect(seenAuth).toBe('Bearer sk-test')
    expect(response.content).toBe('{"category":"factura"}')
    expect(response.usage.totalTokens).toBe(15)
    expect(response.model).toBe('gpt-4o-mini')
  })

  it('lanza error con el estado HTTP del proveedor', async () => {
    const baseUrl = await mockServer(() => ({
      status: 401,
      json: { error: { message: 'invalid api key' } },
    }))
    const provider = new OpenAiProvider({ id: 'openai', apiKey: 'mala', baseUrl, defaultModel: 'gpt-4o-mini' })
    await expect(provider.chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('HTTP 401')
  })

  it('reintenta en 429 y acaba teniendo éxito', async () => {
    let attempts = 0
    const baseUrl = await mockServer((_req, _body) => {
      attempts += 1
      if (attempts === 1) {
        return { status: 429, json: { error: { message: 'rate limited' } } }
      }
      return { status: 200, json: { choices: [{ message: { content: 'ok' } }], usage: {} } }
    })
    const provider = new OpenAiProvider({ id: 'openai', apiKey: 'sk', baseUrl, defaultModel: 'gpt-4o-mini' })
    const response = await provider.chat({ messages: [{ role: 'user', content: 'x' }] })
    expect(response.content).toBe('ok')
    expect(attempts).toBe(2)
  })

  it('health devuelve ok con el endpoint /models', async () => {
    const baseUrl = await mockServer((req) =>
      req.url?.startsWith('/models') ? { status: 200, json: { data: [] } } : { status: 404, json: {} },
    )
    const provider = new OpenAiProvider({ id: 'openai', apiKey: 'sk', baseUrl, defaultModel: 'gpt-4o-mini' })
    const health = await provider.health()
    expect(health.ok).toBe(true)
  })
})
