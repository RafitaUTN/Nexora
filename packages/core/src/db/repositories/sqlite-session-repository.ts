import type { SessionRepository } from '@documind/domain'
import type { SqliteDatabase } from '../database'

interface SessionRow {
  user_id: number
  expires_at: string
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async create(session: { userId: number; tokenHash: string; expiresAt: string }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run(session.userId, session.tokenHash, session.expiresAt)
  }

  async findByTokenHash(tokenHash: string): Promise<{ userId: number; expiresAt: string } | null> {
    const row = this.db
      .prepare(`SELECT user_id, expires_at FROM sessions WHERE token_hash = ?`)
      .get(tokenHash) as SessionRow | undefined
    return row ? { userId: row.user_id, expiresAt: row.expires_at } : null
  }

  async touch(tokenHash: string): Promise<void> {
    this.db
      .prepare(`UPDATE sessions SET last_seen_at = datetime('now') WHERE token_hash = ?`)
      .run(tokenHash)
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash)
  }

  async deleteByUser(userId: number): Promise<void> {
    this.db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId)
  }

  async deleteExpired(): Promise<void> {
    this.db.prepare(`DELETE FROM sessions WHERE datetime(expires_at) < datetime('now')`).run()
  }
}
