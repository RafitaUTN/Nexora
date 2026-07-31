import type { AuditEntry, AuditRepository, NewAuditEntry } from '@documind/domain'
import type { SqliteDatabase } from '../database'
import { toAuditEntry, type AuditRow } from '../mappers'

export class SqliteAuditRepository implements AuditRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async add(entry: NewAuditEntry): Promise<void> {
    this.db
      .prepare(`INSERT INTO audit_log (actor, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)`)
      .run(
        entry.actor ?? 'system',
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.detail ?? null,
      )
  }

  async list(limit: number, cursor?: number): Promise<AuditEntry[]> {
    const where = cursor !== undefined ? 'WHERE id < ?' : ''
    const params = cursor !== undefined ? [cursor, limit] : [limit]
    const rows = this.db
      .prepare(
        `SELECT id, actor, action, entity_type, entity_id, detail, created_at
         FROM audit_log ${where} ORDER BY id DESC LIMIT ?`,
      )
      .all(...params) as AuditRow[]
    return rows.map(toAuditEntry)
  }
}
