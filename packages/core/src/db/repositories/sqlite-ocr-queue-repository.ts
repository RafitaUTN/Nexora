import type { OcrQueueRepository } from '@documind/domain'
import type { SqliteDatabase } from '../database'

export class SqliteOcrQueueRepository implements OcrQueueRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async enqueue(documentId: number, priority = 0): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO ocr_queue (document_id, priority, status) VALUES (?, ?, 'pending')`,
      )
      .run(documentId, priority)
  }

  async nextBatch(limit: number): Promise<{ id: number; documentId: number; priority: number }[]> {
    const rows = this.db
      .prepare(
        `SELECT id, document_id, priority FROM ocr_queue
         WHERE status = 'pending'
         ORDER BY priority DESC, id ASC LIMIT ?`,
      )
      .all(limit) as { id: number; document_id: number; priority: number }[]
    return rows.map((r) => ({ id: r.id, documentId: r.document_id, priority: r.priority }))
  }

  async markProcessing(id: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE ocr_queue SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(id)
  }

  async markDone(id: number): Promise<void> {
    this.db
      .prepare(`UPDATE ocr_queue SET status = 'done', updated_at = datetime('now') WHERE id = ?`)
      .run(id)
  }

  async markError(id: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE ocr_queue SET status = 'error', next_retry_at = datetime('now', '+1 hour'), updated_at = datetime('now') WHERE id = ?`,
      )
      .run(id)
  }

  async pendingCount(): Promise<number> {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM ocr_queue WHERE status IN ('pending', 'processing')`)
      .get() as { n: number }
    return row.n
  }
}
