import type { NewTag, Tag, TagRepository, TagStats } from '@documind/domain'
import type { SqliteDatabase } from '../database'
import { toTag, toTagStats, type TagRow } from '../mappers'

export class SqliteTagRepository implements TagRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async list(): Promise<Tag[]> {
    const rows = this.db.prepare(`SELECT id, name, color, created_at FROM tags ORDER BY name`).all() as TagRow[]
    return rows.map(toTag)
  }

  async listWithStats(): Promise<TagStats[]> {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.name, t.color, t.created_at, COUNT(dt.document_id) AS count
         FROM tags t LEFT JOIN document_tags dt ON dt.tag_id = t.id
         GROUP BY t.id ORDER BY t.name`,
      )
      .all() as (TagRow & { count: number })[]
    return rows.map(toTagStats)
  }

  async findByName(name: string): Promise<Tag | null> {
    const row = this.db.prepare(`SELECT id, name, color, created_at FROM tags WHERE name = ? LIMIT 1`).get(name) as
      | TagRow
      | undefined
    return row ? toTag(row) : null
  }

  async create(tag: NewTag): Promise<Tag> {
    const info = this.db
      .prepare(`INSERT INTO tags (name, color) VALUES (?, ?)`)
      .run(tag.name, tag.color ?? null)
    const id = Number(info.lastInsertRowid)
    const row = this.db.prepare(`SELECT id, name, color, created_at FROM tags WHERE id = ?`).get(id) as TagRow
    return toTag(row)
  }

  async assign(tagId: number, documentId: number): Promise<void> {
    this.db
      .prepare(`INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)`)
      .run(documentId, tagId)
  }

  async unassign(tagId: number, documentId: number): Promise<void> {
    this.db.prepare(`DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?`).run(documentId, tagId)
  }

  async listByDocument(documentId: number): Promise<Tag[]> {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.name, t.color, t.created_at
         FROM tags t JOIN document_tags dt ON dt.tag_id = t.id
         WHERE dt.document_id = ? ORDER BY t.name`,
      )
      .all(documentId) as TagRow[]
    return rows.map(toTag)
  }

  async delete(id: number): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM document_tags WHERE tag_id = ?`).run(id)
      this.db.prepare(`DELETE FROM tags WHERE id = ?`).run(id)
    })
  }
}
