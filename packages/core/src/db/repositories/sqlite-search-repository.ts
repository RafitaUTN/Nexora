import type { DocumentSummary, SearchRepository } from '@documind/domain'
import type { SqliteDatabase } from '../database'
import { toDocumentSummary, type DocumentRow } from '../mappers'

interface FtsRow extends DocumentRow {
  rank: number
}

/** Palabras reservadas de FTS5 y términos vacíos que no deben ser obligatorios. */
const RESERVED = new Set(['and', 'or', 'not', 'near', '(', ')', '->', 'a', 'el', 'la', 'los', 'las', 'de', 'del'])

/**
 * Búsqueda full-text sobre FTS5. Cada término se busca como prefijo (`t*`)
 * con AND implícito; las palabras reservadas de FTS5 se ignoran.
 */
export class SqliteSearchRepository implements SearchRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async fullText(
    query: string,
    limit: number,
    filter?: { ext?: string; tagId?: number },
  ): Promise<{ document: DocumentSummary; score: number }[]> {
    const tokens = query
      .split(/\s+/)
      .filter((t) => t.length > 1 && !RESERVED.has(t.toLowerCase()))
      .map((t) => `"${t.replace(/["*]/g, '')}"*`)
      .join(' ')

    if (!tokens) return []

    const where = ['bm25(documents_fts)']
    const params: (string | number)[] = [tokens]
    if (filter?.ext) {
      where.push('d.ext = ?')
      params.push(filter.ext)
    }
    if (filter?.tagId !== undefined) {
      where.push(
        'EXISTS (SELECT 1 FROM document_tags dt WHERE dt.document_id = d.id AND dt.tag_id = ?)',
      )
      params.push(filter.tagId)
    }

    const sql = `
      SELECT d.id, d.source_id, d.path, d.filename, d.ext, d.mime_type, d.size_bytes,
             d.hash_sha256, d.status, d.title, d.content_preview, d.ocr_confidence,
             d.language, d.version, d.is_duplicate_of, d.file_mtime_ms, d.added_at,
             d.updated_at, d.deleted_at,
             bm25(documents_fts) AS rank
      FROM documents_fts
      JOIN documents d ON d.id = documents_fts.rowid
      JOIN document_contents dc ON dc.document_id = d.id
      WHERE documents_fts MATCH ? AND ${where.join(' AND ')}
      ORDER BY rank ASC
      LIMIT ?
    `
    const rows = this.db.prepare(sql).all(...params, limit) as FtsRow[]
    return rows.map((row) => ({ document: toDocumentSummary(row), score: -row.rank }))
  }
}
