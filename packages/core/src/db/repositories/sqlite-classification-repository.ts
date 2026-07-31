import type {
  Classification,
  ClassificationRepository,
  ExtractedEntity,
} from '@documind/domain'
import type { SqliteDatabase } from '../database'
import { toClassification, toExtractedEntity, type ClassificationRow, type EntityRow } from '../mappers'

export class SqliteClassificationRepository implements ClassificationRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async save(classification: Classification): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO classifications (document_id, category, confidence, provider, model, cached, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(document_id) DO UPDATE SET
           category = excluded.category,
           confidence = excluded.confidence,
           provider = excluded.provider,
           model = excluded.model,
           cached = excluded.cached,
           created_at = excluded.created_at`,
      )
      .run(
        classification.documentId,
        classification.category,
        classification.confidence,
        classification.provider,
        classification.model,
        classification.cached ? 1 : 0,
        classification.createdAt,
      )
  }

  async findByDocumentId(documentId: number): Promise<Classification | null> {
    const row = this.db
      .prepare(
        `SELECT document_id, category, confidence, provider, model, cached, created_at
         FROM classifications WHERE document_id = ?`,
      )
      .get(documentId) as ClassificationRow | undefined
    return row ? toClassification(row) : null
  }

  async saveEntities(documentId: number, entities: ExtractedEntity[]): Promise<void> {
    if (entities.length === 0) return
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM entities WHERE document_id = ?`).run(documentId)
      const insert = this.db.prepare(
        `INSERT INTO entities (document_id, kind, value, confidence) VALUES (?, ?, ?, ?)`,
      )
      for (const entity of entities) {
        insert.run(documentId, entity.kind, entity.value, entity.confidence)
      }
    })
  }

  async listEntities(documentId: number): Promise<ExtractedEntity[]> {
    const rows = this.db
      .prepare(`SELECT kind, value, confidence FROM entities WHERE document_id = ? ORDER BY id`)
      .all(documentId) as EntityRow[]
    return rows.map(toExtractedEntity)
  }
}
