export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>, error?: Error): void
}

const DEFAULT_REDACT_KEYS = ['apikey', 'api_key', 'authorization', 'token', 'password', 'secret', 'key']

function redactValue(value: unknown, keys: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => redactValue(v, keys))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase()
      const isSensitive = keys.some((rk) => lower.includes(rk))
      out[k] = isSensitive ? '[REDACTED]' : redactValue(v, keys)
    }
    return out
  }
  return value
}

/**
 * Logger estructurado con redacción automática de secretos.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly level: LogLevel = 'info',
    private readonly redactKeys: string[] = DEFAULT_REDACT_KEYS,
  ) {}

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.write('debug', msg, meta)
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this.write('info', msg, meta)
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.write('warn', msg, meta)
  }

  error(msg: string, meta?: Record<string, unknown>, error?: Error): void {
    this.write('error', msg, { ...(meta ?? {}), error: error?.stack ?? error?.message })
  }

  private write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (this.levelRank(level) < this.levelRank(this.level)) return
    const safe = meta ? redactValue(meta, this.redactKeys) : undefined
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...(safe as Record<string, unknown> | undefined),
    })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }

  private levelRank(level: LogLevel): number {
    return { debug: 0, info: 1, warn: 2, error: 3 }[level]
  }
}
