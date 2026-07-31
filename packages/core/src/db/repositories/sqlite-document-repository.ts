import { createHash } from 'node:crypto'
import type {
  Document,
  DocumentFilter,
  DocumentRepository,
  DocumentStats,
  DocumentSummary,
  HistoryEntry,
  NewDocument,
  NewHistoryEntry,
  PagedResult,
} from '@documind/domain'
import type { SqliteDatabase } from '../database'
import { toDocument, toDocumentSummary, toHistoryEntry, type DocumentRow } from '../mappers'

const SELECT_COLUMNS = `
  id, source_id, path, filename, ext, mime_type, size_bytes, hash_sha256, status,
  title, content_preview, ocr_confidence, language, version, is_duplicate_of,
  file_mtime_ms, added_at, updated_at, deleted_at
`

const SORT_COLUMNS: Record<NonNullable<DocumentFilter['sort']>, string> = {
  addedAt: 'added_at',
  updatedAt: 'updated_at',
  filename: 'filename COLLATE NOCASE',
  sizeBytes: 'size_bytes',
}

/**
 * Repositorio SQLite de documentos. Statements preparados, paginación por
 * cursor y sin N+1.
 */
export class SqliteDocumentRepository implements DocumentRepository {
  constructor(private readonly db: SqliteDatabase) {}

  save(doc: NewDocument): Promise<Document> {
    const info = this.db
      .prepare(
        `INSERT INTO documents
           (source_id, path, filename, ext, mime_type, size_bytes, hash_sha256, file_mtime_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        doc.sourceId,
        doc.path,
        doc.filename,
        doc.ext,
        doc.mimeType,
        doc.sizeBytes,
        doc.hashSha256,
        doc.fileMtimeMs,
      )
    const id = Number(info.lastInsertRowid)
    return this.findById(id).then((row) => {
      if (!row) throw new Error(`No se pudo crear el documento ${id}`)
      return row
    })
  }

  async updateStatus(id: number, status: Document['status']): Promise<void> {
    this.db
      .prepare(`UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, id)
  }

  async updateContentPreview(id: number, preview: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE documents SET content_preview = substr(?, 1, 500), updated_at = datetime('now') WHERE id = ?`,
      )
      .run(preview, id)
  }

  async setDuplicate(id: number, duplicateOf: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE documents SET is_duplicate_of = ?, status = 'indexed', updated_at = datetime('now') WHERE id = ?`,
      )
      .run(duplicateOf, id)
  }

  async findById(id: number): Promise<Document | null> {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM documents WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as DocumentRow | undefined
    return row ? toDocument(row) : null
  }

  async findByPath(sourceId: number | null, path: string): Promise<Document | null> {
    const row = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM documents WHERE source_id IS ? AND path = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .get(sourceId, path) as DocumentRow | undefined
    return row ? toDocument(row) : null
  }

  async findByHash(hash: string): Promise<Document[]> {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM documents WHERE hash_sha256 = ? AND deleted_at IS NULL LIMIT 5`,
      )
      .all(hash) as DocumentRow[]
    return rows.map(toDocument)
  }

  async list(filter: DocumentFilter): Promise<PagedResult<DocumentSummary>> {
    const where: string[] = ['deleted_at IS NULL']
    const params: (string | number)[] = []

    if (filter.query) {
      where.push(`(filename LIKE ? OR title LIKE ?)`)
      params.push(`%${filter.query}%`, `%${filter.query}%`)
    }
    if (filter.status) {
      where.push('status = ?')
      params.push(filter.status)
    }
    if (filter.ext) {
      where.push('ext = ?')
      params.push(filter.ext)
    }
    if (filter.isDuplicate !== undefined) {
      where.push(filter.isDuplicate ? 'is_duplicate_of IS NOT NULL' : 'is_duplicate_of IS NULL')
    }
    if (filter.cursor !== undefined) {
      where.push('id < ?')
      params.push(filter.cursor)
    }
    if (filter.tagId !== undefined) {
      where.push('EXISTS (SELECT 1 FROM document_tags dt WHERE dt.document_id = documents.id AND dt.tag_id = ?)')
      params.push(filter.tagId)
    }

    const limit = filter.limit
    const sort = SORT_COLUMNS[filter.sort ?? 'addedAt']
    const dir = filter.direction === 'asc' ? 'ASC' : 'DESC'
    const sql = `SELECT ${SELECT_COLUMNS} FROM documents WHERE ${where.join(' AND ')}
      ORDER BY ${sort} ${dir}, id ${dir} LIMIT ?`
    const rows = this.db.prepare(sql).all(...params, limit + 1) as DocumentRow[]

    const hasMore = rows.length > limit
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toDocumentSummary)
    const last = items[items.length - 1]
    return { items, nextCursor: last ? last.id : null, hasMore }
  }

  async stats(): Promise<DocumentStats> {
    const totals = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'indexed' THEN 1 ELSE 0 END) AS indexed,
           SUM(CASE WHEN status IN ('pending','extracting','ocr','ai') THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN is_duplicate_of IS NOT NULL THEN 1 ELSE 0 END) AS duplicates,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
           COALESCE(SUM(size_bytes), 0) AS total_size
         FROM documents WHERE deleted_at IS NULL`,
      )
      .get() as {
      total: number
      indexed: number | null
      pending: number | null
      duplicates: number | null
      errors: number | null
      total_size: number
    }

    const byExt = this.db
      .prepare(`SELECT ext, COUNT(*) AS n FROM documents WHERE deleted_at IS NULL GROUP BY ext ORDER BY n DESC`)
      .all() as { ext: string; n: number }[]

    return {
      total: totals.total,
      indexed: totals.indexed ?? 0,
      pending: totals.pending ?? 0,
      duplicates: totals.duplicates ?? 0,
      errors: totals.errors ?? 0,
      totalSizeBytes: totals.total_size,
      byExt: Object.fromEntries(byExt.map((r) => [r.ext, r.n])),
    }
  }

  async remove(id: number): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM document_contents WHERE document_id = ?`).run(id)
      this.db.prepare(`DELETE FROM documents WHERE id = ?`).run(id)
    })
  }

  async markDeleted(id: number): Promise<void> {
    this.db
      .prepare(`UPDATE documents SET deleted_at = datetime('now'), status = 'error' WHERE id = ?`)
      .run(id)
  }

  async setContent(id: number, content: string): Promise<void> {
    const hash = this.sha256(content)
    this.db
      .prepare(
        `INSERT INTO document_contents (document_id, content, content_hash, fts_indexed_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(document_id) DO UPDATE SET
           content = excluded.content,
           content_hash = excluded.content_hash,
           fts_indexed_at = datetime('now')`,
      )
      .run(id, content, hash)
  }

  async getContent(id: number): Promise<string | null> {
    const row = this.db
      .prepare(`SELECT content FROM document_contents WHERE document_id = ?`)
      .get(id) as { content: string } | undefined
    return row?.content ?? null
  }

  async addVersion(
    documentId: number,
    version: number,
    path: string,
    hash: string,
    size: number,
    note?: string,
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO document_versions (document_id, version, path, hash_sha256, size_bytes, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(documentId, version, path, hash, size, note ?? null)
  }

  async bumpVersion(id: number): Promise<number> {
    const info = this.db
      .prepare(`UPDATE documents SET version = version + 1, updated_at = datetime('now') WHERE id = ?`)
      .run(id)
    if (info.changes === 0) throw new Error(`Documento no encontrado: ${id}`)
    const row = this.db.prepare(`SELECT version FROM documents WHERE id = ?`).get(id) as {
      version: number
    }
    return row.version
  }

  async addHistory(entry: NewHistoryEntry): Promise<void> {
    this.db
      .prepare(`INSERT INTO history (document_id, action, detail, actor) VALUES (?, ?, ?, ?)`)
      .run(entry.documentId, entry.action, entry.detail ?? null, entry.actor ?? 'system')
  }

  async listHistory(documentId: number, limit: number): Promise<HistoryEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT id, document_id, action, detail, actor, created_at
         FROM history WHERE document_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(documentId, limit) as Parameters<typeof toHistoryEntry>[0][]
    return rows.map(toHistoryEntry)
  }

  private sha256(content: string): string {
    return createHash('sha256').update(content).digest('hex')
  }
}
