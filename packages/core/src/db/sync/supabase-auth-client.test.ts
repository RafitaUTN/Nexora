import { describe, expect, it } from 'vitest'
import { SyncError } from '@documind/domain'
import { SupabaseAuthClient, decodeJwtPayload } from './supabase-auth-client'

function b64url(json: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url')
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.sig`
}

function mockFetch(handler: (url: string, init: RequestInit) => unknown): {
  client: SupabaseAuthClient
  calls: { url: string; init: RequestInit }[]
} {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init: init ?? {} })
    const body = handler(u, init ?? {})
    return {
      ok: body instanceof Error ? false : true,
      status: body instanceof Error ? 400 : 200,
      statusText: 'OK',
      text: async () => (body instanceof Error ? body.message : JSON.stringify(body)),
      json: async () => body,
    } as Response
  }) as typeof fetch
  return { client: new SupabaseAuthClient({ url: 'https://x.supabase.co/', anonKey: 'anon-k', fetchImpl }), calls }
}

describe('SupabaseAuthClient', () => {
  it('login envía grant_type=password y construye la sesión desde el JWT', async () => {
    const { client, calls } = mockFetch(() => ({
      access_token: jwt({ sub: 'user-1', email: 'a@x.co' }),
      refresh_token: 'rt-1',
      expires_in: 3600,
    }))
    const session = await client.login('a@x.co', 'secret')
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/token?grant_type=password')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: 'a@x.co', password: 'secret' })
    expect(calls[0]?.init.headers).toMatchObject({ apikey: 'anon-k' })
    expect(session.userId).toBe('user-1')
    expect(session.email).toBe('a@x.co')
    expect(session.refreshToken).toBe('rt-1')
    expect(session.expiresAt).toBeGreaterThan(Date.now())
  })

  it('refresh renueva la sesión con grant_type=refresh_token', async () => {
    const { client, calls } = mockFetch(() => ({
      access_token: jwt({ sub: 'user-1', email: 'a@x.co' }),
      refresh_token: 'rt-2',
      expires_in: 60,
    }))
    const session = await client.refresh('rt-1')
    expect(calls[0]?.url).toContain('grant_type=refresh_token')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ refresh_token: 'rt-1' })
    expect(session.refreshToken).toBe('rt-2')
  })

  it('signUp devuelve sesión cuando el correo no requiere confirmación', async () => {
    const { client } = mockFetch(() => ({
      access_token: jwt({ sub: 'user-2', email: 'b@x.co' }),
      refresh_token: 'rt-3',
      expires_in: 3600,
    }))
    const result = await client.signUp('b@x.co', 'pw')
    expect(result.confirmationRequired).toBe(false)
    expect(result.session?.userId).toBe('user-2')
  })

  it('signUp devuelve confirmationRequired sin sesión si falta access_token', async () => {
    const { client, calls } = mockFetch(() => ({ user: { id: 'user-3', email: 'c@x.co' } }))
    const result = await client.signUp('c@x.co', 'pw')
    expect(calls[0]?.url).toBe('https://x.supabase.co/auth/v1/signup')
    expect(result).toEqual({ session: null, confirmationRequired: true })
  })

  it('traduce credenciales inválidas a ERR_SYNC_AUTH', async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => '{"error":"invalid_grant","error_description":"Invalid login credentials"}',
      json: async () => null,
    })) as unknown as typeof fetch
    const client = new SupabaseAuthClient({ url: 'https://x.supabase.co', anonKey: 'k', fetchImpl })
    await expect(client.login('a@x.co', 'bad')).rejects.toMatchObject({
      code: 'ERR_SYNC_AUTH',
      message: 'Correo o contraseña incorrectos',
    })
    expect(client.login('a@x.co', 'bad')).rejects.toBeInstanceOf(SyncError)
  })

  it('signUp con error traduce el mensaje del cuerpo no JSON a ERR_SYNC_AUTH', async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => 'cuerpo sin json',
      json: async () => null,
    })) as unknown as typeof fetch
    const client = new SupabaseAuthClient({ url: 'https://x.supabase.co', anonKey: 'k', fetchImpl })
    await expect(client.signUp('a@x.co', 'password')).rejects.toMatchObject({
      code: 'ERR_SYNC_AUTH',
    })
  })

  it('usa el fallback de user.email cuando el JWT no expone el correo', async () => {
    const { client } = mockFetch(() => ({
      access_token: jwt({ sub: 'user-4' }),
      refresh_token: 'rt',
      expires_in: 3600,
      user: { id: 'user-4', email: 'd@x.co' },
    }))
    const session = await client.login('d@x.co', 'pw')
    expect(session.email).toBe('d@x.co')
  })
})

describe('decodeJwtPayload', () => {
  it('decodifica sub y email de un JWT', () => {
    expect(decodeJwtPayload(jwt({ sub: 'u1', email: 'e@x.co' }))).toEqual({ sub: 'u1', email: 'e@x.co' })
  })

  it('devuelve null para tokens inválidos', () => {
    expect(decodeJwtPayload('')).toBeNull()
    expect(decodeJwtPayload('sin-segundo-segmento')).toBeNull()
    expect(decodeJwtPayload('x.not-json.sig')).toBeNull()
  })
})
