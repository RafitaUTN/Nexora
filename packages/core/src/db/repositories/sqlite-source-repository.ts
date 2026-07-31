import type { DocumentSource, NewSource, SourceRepository } from '@documind/domain'
import type { SqliteDatabase } from '../database'
import { toSource, type SourceRow } from '../mappers'

export class SqliteSourceRepository implements SourceRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async list(): Promise<DocumentSource[]> {
    const rows = this.db
      .prepare(
        `SELECT id, path, name, kind, scan_mode, enabled, last_scan_at, created_at FROM sources ORDER BY name`,
      )
      .all() as SourceRow[]
    return rows.map(toSource)
  }

  async add(source: NewSource): Promise<DocumentSource> {
    const info = this.db
      .prepare(
        `INSERT INTO sources (path, name, kind, scan_mode, enabled) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(source.path, source.name, source.kind, source.scanMode, source.enabled ? 1 : 0)
    const id = Number(info.lastInsertRowid)
    const row = this.db
      .prepare(
        `SELECT id, path, name, kind, scan_mode, enabled, last_scan_at, created_at FROM sources WHERE id = ?`,
      )
      .get(id) as SourceRow
    return toSource(row)
  }

  async remove(id: number): Promise<void> {
    this.db.prepare(`DELETE FROM sources WHERE id = ?`).run(id)
  }

  async setLastScan(id: number, date: string): Promise<void> {
    this.db.prepare(`UPDATE sources SET last_scan_at = ? WHERE id = ?`).run(date, id)
  }
}
