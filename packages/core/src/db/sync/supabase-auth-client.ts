import { SyncError } from '@documind/domain'

/**
 * Sesión de Supabase Auth obtenida del endpoint `/auth/v1/token`.
 * El `access_token` es un JWT; `sub` es el UUID del usuario (columna `user_id`).
 */
export interface SupabaseSession {
  accessToken: string
  refreshToken: string
  /** Expiración en epoch ms (el servidor devuelve `expires_in` segundos). */
  expiresAt: number
  /** `sub` del JWT: identifica al usuario para las políticas RLS. */
  userId: string
  email: string
}

export interface SupabaseAuthClientConfig {
  /** URL base del proyecto, p. ej. `https://xxxx.supabase.co` (sin barra final). */
  url: string
  /** Clave publicable (anon) del proyecto; la usa el endpoint de GoTrue. */
  anonKey: string
  fetchImpl?: typeof fetch
}

/** Resultado del registro: sesión inmediata o confirmación de correo pendiente. */
export type SupabaseSignUpResult =
  | { session: SupabaseSession; confirmationRequired: false }
  | { session: null; confirmationRequired: true }

interface GoTrueTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  user?: { id?: string; email?: string }
}

interface GoTrueSignUpResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: { id?: string; email?: string }
}

/**
 * Cliente mínimo de Supabase Auth (GoTrue) usando `fetch` únicamente.
 * Solo maneja contraseña y renovación de sesión; el token se guarda cifrado
 * por el SecretStore, nunca en la configuración en texto plano.
 */
export class SupabaseAuthClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: SupabaseAuthClientConfig) {
    this.baseUrl = config.url.replace(/\/+$/, '')
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  /** Inicia sesión con correo y contraseña (`grant_type=password`). */
  async login(email: string, password: string): Promise<SupabaseSession> {
    const body = await this.tokenRequest(
      `grant_type=password`,
      JSON.stringify({ email, password }),
    )
    return this.toSession(body)
  }

  /** Renueva la sesión con un `refresh_token` (`grant_type=refresh_token`). */
  async refresh(refreshToken: string): Promise<SupabaseSession> {
    const body = await this.tokenRequest(
      `grant_type=refresh_token`,
      JSON.stringify({ refresh_token: refreshToken }),
    )
    return this.toSession(body)
  }

  /** Registra una cuenta nueva. Si la confirmación de correo está activa,
   *  devuelve `confirmationRequired: true` sin sesión. */
  async signUp(email: string, password: string): Promise<SupabaseSignUpResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) {
      throw this.toError(response, await response.text().catch(() => ''))
    }
    const data = (await response.json()) as GoTrueSignUpResponse
    if (!data.access_token || !data.refresh_token) {
      return { session: null, confirmationRequired: true }
    }
    return {
      session: this.toSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in ?? 3600,
        user: data.user,
      }),
      confirmationRequired: false,
    }
  }

  private async tokenRequest(query: string, body: string): Promise<GoTrueTokenResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/auth/v1/token?${query}`, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        'Content-Type': 'application/json',
      },
      body,
    })
    if (!response.ok) {
      throw this.toError(response, await response.text().catch(() => ''))
    }
    return (await response.json()) as GoTrueTokenResponse
  }

  private toSession(data: GoTrueTokenResponse): SupabaseSession {
    const decoded = decodeJwtPayload(data.access_token)
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1_000,
      userId: String(decoded?.sub ?? data.user?.id ?? ''),
      email: String(decoded?.email ?? data.user?.email ?? ''),
    }
  }

  private toError(response: { status: number; statusText: string }, body: string): Error {
    let message = body || response.statusText
    try {
      const parsed = JSON.parse(body) as { error_description?: string; error?: string; msg?: string }
      message = parsed.error_description ?? parsed.msg ?? parsed.error ?? message
    } catch {
      // se usa el cuerpo tal cual
    }
    if (response.status === 400 || response.status === 401 || response.status === 422) {
      return new SyncError(
        message.includes('Invalid login') ? 'Correo o contraseña incorrectos' : message,
        'ERR_SYNC_AUTH',
      )
    }
    return new SyncError(`Supabase respondió ${response.status}: ${message}`, 'ERR_SYNC_AUTH')
  }
}

/** Decodifica la carga útil (payload) de un JWT sin verificar la firma. */
export function decodeJwtPayload(token: string): { sub?: string; email?: string } | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json) as { sub?: string; email?: string }
  } catch {
    return null
  }
}
