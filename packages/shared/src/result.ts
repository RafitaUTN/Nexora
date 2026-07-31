export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

export interface AppError {
  code: string
  message: string
  details?: unknown
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function err(code: string, message: string, details?: unknown): Result<never> {
  return { ok: false, error: { code, message, details } }
}

export function isOk<T>(r: Result<T>): r is { ok: true; data: T } {
  return r.ok
}
