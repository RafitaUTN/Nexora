import Database from 'better-sqlite3'

type SqlValue = string | number | bigint | Buffer | null

interface StatementLike {
  run(...params: SqlValue[]): { changes: number; lastInsertRowid: number | bigint }
  get(...params: SqlValue[]): unknown
  all(...params: SqlValue[]): unknown[]
}

/**
 * Wrapper de SQLite con configuración de producción:
 * WAL, foreign_keys, busy_timeout y statements preparados.
 */
export class SqliteDatabase {
  readonly db: Database.Database

  constructor(filePath: string) {
    this.db = new Database(filePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): StatementLike {
    return this.db.prepare(sql) as unknown as StatementLike
  }

  transaction<T>(fn: () => T): T {
    const run = this.db.transaction(fn)
    return run()
  }

  checkpoint(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)')
  }

  close(): void {
    this.db.close()
  }
}
