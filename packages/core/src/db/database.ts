import { DatabaseSync } from './node-sqlite'
import type { DatabaseSync as DatabaseSyncType } from './node-sqlite'

type SqlValue = string | number | bigint | Buffer | Uint8Array | null

interface StatementLike {
  run(...params: SqlValue[]): { changes: number; lastInsertRowid: number | bigint }
  get(...params: SqlValue[]): unknown
  all(...params: SqlValue[]): unknown[]
}

/**
 * SQLite devuelve los BLOB como Uint8Array; los repositorios esperan Buffer.
 */
function toBuffer(value: unknown): unknown {
  return value instanceof Uint8Array ? Buffer.from(value) : value
}

function rowWithBuffers(row: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(row)) row[key] = toBuffer(row[key])
  return row
}

/**
 * Wrapper de SQLite con configuración de producción:
 * WAL, foreign_keys, busy_timeout y statements preparados.
 * Usa `node:sqlite` (built-in de Node) para evitar módulos nativos de ABI
 * específico que requieran rebuild para Electron.
 */
export class SqliteDatabase {
  readonly db: DatabaseSyncType

  constructor(filePath: string) {
    this.db = new DatabaseSync(filePath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA busy_timeout = 5000')
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): StatementLike {
    const statement = this.db.prepare(sql)
    return {
      run(...params: SqlValue[]) {
        const info = statement.run(...params)
        return { changes: Number(info.changes), lastInsertRowid: info.lastInsertRowid }
      },
      get(...params: SqlValue[]) {
        const row = statement.get(...params) as Record<string, unknown> | undefined
        return row ? rowWithBuffers(row) : undefined
      },
      all(...params: SqlValue[]) {
        const rows = statement.all(...params) as Record<string, unknown>[]
        return rows.map(rowWithBuffers)
      },
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  checkpoint(): void {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  }

  close(): void {
    this.db.close()
  }
}
