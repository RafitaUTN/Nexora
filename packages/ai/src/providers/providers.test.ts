import { describe, afterEach, it, expect } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { OllamaProvider } from './ollama'
import { ClaudeProvider } from './claude'
import { GeminiProvider } from './gemini'
import { OpenRouterProvider } from './openrouter'

let servers: Server[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
})

async function mockServer(handler: (req: IncomingMessage, body: string) => { status: number; json?: unknown }): Promise<string> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const result = handler(req, body)
      res.writeHead(result.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(result.json ?? {}))
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

describe('OllamaProvider', () => {
  it('chatea contra /api/chat sin apiKey y mapea uso', async () => {
    const baseUrl = await mockServer((_req, body) => {
      const parsed = JSON.parse(body)
      return {
        status: 200,
        json: { message: { content: '{"category":"factura"}' }, prompt_eval_count: 20, eval_count: 8 },
        ...(parsed.stream === false ? {} : {}),
      }
    })
    const provider = new OllamaProvider({ id: 'ollama', apiKey: '', baseUrl, defaultModel: 'llama3.2' })
    const response = await provider.chat({ messages: [{ role: 'user', content: 'clasifica' }] })
    expect(response.content).toBe('{"category":"factura"}')
    expect(response.usage.promptTokens).toBe(20)
    expect(response.usage.completionTokens).toBe(8)
  })

  it('health es ok contra /api/tags', async () => {
    const baseUrl = await mockServer((req) =>
      req.url?.startsWith('/api/tags') ? { status: 200, json: { models: [] } } : { status: 404, json: {} },
    )
    const provider = new OllamaProvider({ id: 'ollama', apiKey: '', baseUrl, defaultModel: 'llama3.2' })
    expect((await provider.health()).ok).toBe(true)
  })

  it('health no-ok si el servidor no responde', async () => {
    const provider = new OllamaProvider({ id: 'ollama', apiKey: '', baseUrl: 'http://127.0.0.1:1', defaultModel: 'llama3.2' })
    const health = await provider.health()
    expect(health.ok).toBe(false)
    expect(health.error?.length ?? 0).toBeGreaterThan(0)
  })
})

describe('ClaudeProvider', () => {
  it('chatea enviando x-api-key y anthropic-version', async () => {
    let headers = ''
    const baseUrl = await mockServer((req) => {
      headers = `${req.headers['x-api-key'] ?? ''}|${req.headers['anthropic-version'] ?? ''}`
      return { status: 200, json: { content: [{ text: 'hola' }], usage: { input_tokens: 5, output_tokens: 3 } } }
    })
    const provider = new ClaudeProvider({ id: 'claude', apiKey: 'ant-key', baseUrl, defaultModel: 'claude-3-5-haiku' })
    const response = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] })
    expect(response.content).toBe('hola')
    expect(response.usage.totalTokens).toBe(8)
    expect(headers).toContain('ant-key')
    expect(headers).toContain('2023-06-01')
  })
})

describe('GeminiProvider', () => {
  it('chatea contra generateContent con x-goog-api-key', async () => {
    let header = ''
    const baseUrl = await mockServer((req) => {
      header = req.headers['x-goog-api-key'] as string
      return {
        status: 200,
        json: { candidates: [{ content: { parts: [{ text: '{"category":"contrato"}' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 } },
      }
    })
    const provider = new GeminiProvider({ id: 'gemini', apiKey: 'g-key', baseUrl, defaultModel: 'gemini-1.5-flash' })
    const response = await provider.chat({ messages: [{ role: 'user', content: 'x' }] })
    expect(response.content).toContain('contrato')
    expect(response.usage.totalTokens).toBe(14)
    expect(header).toBe('g-key')
  })
})

describe('OpenRouterProvider', () => {
  it('chatea con auth Bearer', async () => {
    let auth = ''
    const baseUrl = await mockServer((req) => {
      auth = req.headers.authorization ?? ''
      return { status: 200, json: { choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 7 } } }
    })
    const provider = new OpenRouterProvider({ id: 'openrouter', apiKey: 'or-key', baseUrl, defaultModel: 'openai/gpt-4o-mini' })
    const response = await provider.chat({ messages: [{ role: 'user', content: 'x' }] })
    expect(response.content).toBe('ok')
    expect(response.usage.totalTokens).toBe(7)
    expect(auth).toBe('Bearer or-key')
  })

  it('lanza el error del proveedor si viene en el cuerpo', async () => {
    const baseUrl = await mockServer(() => ({ status: 200, json: { error: { message: 'quota exceeded' } } }))
    const provider = new OpenRouterProvider({ id: 'openrouter', apiKey: 'k', baseUrl, defaultModel: 'm' })
    await expect(provider.chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('quota exceeded')
  })

  it('lanza si la respuesta está vacía', async () => {
    const baseUrl = await mockServer(() => ({ status: 200, json: { choices: [] } }))
    const provider = new OpenRouterProvider({ id: 'openrouter', apiKey: 'k', baseUrl, defaultModel: 'm' })
    await expect(provider.chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('Respuesta vacía')
  })

  it('envía response_format json y model cuando se indican', async () => {
    let body = ''
    const baseUrl = await mockServer((_req, raw) => {
      body = raw
      return { status: 200, json: { choices: [{ message: { content: 'x' } }] } }
    })
    const provider = new OpenRouterProvider({ id: 'openrouter', apiKey: 'k', baseUrl, defaultModel: 'm' })
    await provider.chat({
      messages: [{ role: 'user', content: 'x' }],
      model: 'custom',
      responseFormat: 'json',
      maxTokens: 100,
    })
    expect(body).toContain('"model":"custom"')
    expect(body).toContain('"response_format":{"type":"json_object"}')
    expect(body).toContain('"max_tokens":100')
  })

  it('health falla si /models no responde ok', async () => {
    const baseUrl = await mockServer((req) =>
      req.url?.startsWith('/models') ? { status: 500, json: {} } : { status: 404, json: {} },
    )
    const provider = new OpenRouterProvider({ id: 'openrouter', apiKey: 'k', baseUrl, defaultModel: 'm' })
    const health = await provider.health()
    expect(health.ok).toBe(false)
    expect(health.error).toContain('500')
  })

  it('health es ok contra /models', async () => {
    const baseUrl = await mockServer((req) =>
      req.url?.startsWith('/models') ? { status: 200, json: { data: [] } } : { status: 404, json: {} },
    )
    const provider = new OpenRouterProvider({ id: 'openrouter', apiKey: 'k', baseUrl, defaultModel: 'm' })
    expect((await provider.health()).ok).toBe(true)
  })
})

describe('ClaudeProvider con system y errores', () => {
  it('incluye system y max_tokens en la petición', async () => {
    let body = ''
    const baseUrl = await mockServer((_req, raw) => {
      body = raw
      return { status: 200, json: { content: [{ text: 'ok' }], usage: {} } }
    })
    const provider = new ClaudeProvider({ id: 'claude', apiKey: 'k', baseUrl, defaultModel: 'claude-3-5-haiku' })
    await provider.chat({
      messages: [
        { role: 'system', content: 'sé breve' },
        { role: 'user', content: 'x' },
      ],
      maxTokens: 500,
    })
    expect(body).toContain('"system":"sé breve"')
    expect(body).toContain('"max_tokens":500')
  })

  it('lanza el error del proveedor', async () => {
    const baseUrl = await mockServer(() => ({ status: 200, json: { error: { message: 'overloaded' } } }))
    const provider = new ClaudeProvider({ id: 'claude', apiKey: 'k', baseUrl, defaultModel: 'm' })
    await expect(provider.chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('overloaded')
  })

  it('lanza si el contenido está vacío', async () => {
    const baseUrl = await mockServer(() => ({ status: 200, json: { content: [] } }))
    const provider = new ClaudeProvider({ id: 'claude', apiKey: 'k', baseUrl, defaultModel: 'm' })
    await expect(provider.chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('Respuesta vacía')
  })

  it('health no-ok propaga el estado', async () => {
    const baseUrl = await mockServer(() => ({ status: 401, json: {} }))
    const provider = new ClaudeProvider({ id: 'claude', apiKey: 'k', baseUrl, defaultModel: 'm' })
    expect((await provider.health()).ok).toBe(false)
  })
})

describe('GeminiProvider con errores', () => {
  it('lanza el error del proveedor', async () => {
    const baseUrl = await mockServer(() => ({ status: 200, json: { error: { message: 'invalid key' } } }))
    const provider = new GeminiProvider({ id: 'gemini', apiKey: 'k', baseUrl, defaultModel: 'gemini-1.5-flash' })
    await expect(provider.chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('invalid key')
  })

  it('incluye systemInstruction y responseMimeType', async () => {
    let body = ''
    const baseUrl = await mockServer((_req, raw) => {
      body = raw
      return { status: 200, json: { candidates: [{ content: { parts: [{ text: 'x' }] } }] } }
    })
    const provider = new GeminiProvider({ id: 'gemini', apiKey: 'k', baseUrl, defaultModel: 'gemini-1.5-flash' })
    await provider.chat({
      messages: [
        { role: 'system', content: 'ayuda' },
        { role: 'user', content: 'x' },
      ],
      responseFormat: 'json',
    })
    expect(body).toContain('systemInstruction')
    expect(body).toContain('"responseMimeType":"application/json"')
  })

  it('health no-ok propaga el estado', async () => {
    const baseUrl = await mockServer(() => ({ status: 403, json: {} }))
    const provider = new GeminiProvider({ id: 'gemini', apiKey: 'k', baseUrl, defaultModel: 'm' })
    expect((await provider.health()).ok).toBe(false)
  })
})
