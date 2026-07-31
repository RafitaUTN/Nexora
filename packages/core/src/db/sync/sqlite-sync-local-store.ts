import type {
  SyncChange,
  SyncEntity,
  SyncOperation,
  SyncSettings,
  SyncStatus,
} from '@documind/domain'
import type { SyncLocalStore } from '@documind/domain'
import type { SqliteDatabase } from '../database'
import type { DocumentRow, TagRow } from '../mappers'

interface OutboxRow {
  entity: SyncEntity
  entity_key: string
  op: SyncOperation
  updated_at_ms: number
}

interface SyncMetaRow {
  entity: string
  device_id: string
  local_id: string
  mapped_id: number
}

const SETTINGS_KEY = 'sync.settings'

/**
 * Almacén local de sincronización sobre SQLite.
 *
 * - El outbox (`sync_outbox`) se rellena por triggers en documents/tags/
 *   document_tags, por lo que cualquier escritura del dominio queda
 *   registrada sin tocar los repositorios.
 * - `pending()` reconstruye el payload de cada cambio contra las tablas reales.
 * - `applyRemote()` aplica con LWW: si el outbox local es más reciente
 *   (updated_at_ms >= remoto) se descarta el cambio remoto.
 * - `sync_meta` mapea (device_id, local_id) remotos al id local real para
 *   evitar colisiones entre dispositivos.
 */
export class SqliteSyncLocalStore implements SyncLocalStore {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly deviceId: string,
  ) {}

  async getSettings(): Promise<SyncSettings> {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(SETTINGS_KEY) as { value: string } | undefined
    if (!row) return { enabled: false, url: '', anonKey: '', email: '', lastPullMs: 0 }
    try {
      const parsed = JSON.parse(row.value) as Partial<SyncSettings>
      return {
        enabled: parsed.enabled ?? false,
        url: parsed.url ?? '',
        anonKey: parsed.anonKey ?? '',
        email: parsed.email ?? '',
        lastPullMs: parsed.lastPullMs ?? 0,
      }
    } catch {
      return { enabled: false, url: '', anonKey: '', email: '', lastPullMs: 0 }
    }
  }

  async saveSettings(settings: SyncSettings): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .run(SETTINGS_KEY, JSON.stringify(settings))
  }

  async getDeviceId(): Promise<string> {
    return this.deviceId
  }

  async status(): Promise<Omit<SyncStatus, 'url' | 'configured' | 'anonKeySet'>> {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE synced = 0`)
      .get() as { n: number }
    const settings = await this.getSettings()
    return {
      enabled: settings.enabled,
      authenticated: settings.email.length > 0,
      email: settings.email,
      deviceId: this.deviceId,
      pending: row.n,
      lastPullMs: settings.lastPullMs,
    }
  }

  async pending(): Promise<SyncChange[]> {
    const rows = this.db
      .prepare(`SELECT entity, entity_key, op, updated_at_ms FROM sync_outbox WHERE synced = 0 ORDER BY updated_at_ms`)
      .all() as OutboxRow[]
    return rows.map((row) => this.buildChange(row))
  }

  async markSynced(keys: string[]): Promise<void> {
    this.db.transaction(() => {
      const stmt = this.db.prepare(`UPDATE sync_outbox SET synced = 1 WHERE entity = ? AND entity_key = ?`)
      for (const key of keys) {
        const sep = key.indexOf(':')
        if (sep < 0) continue
        const entity = key.slice(0, sep)
        const entityKey = key.slice(sep + 1)
        stmt.run(entity, entityKey)
      }
    })
  }

  async applyRemote(changes: SyncChange[]): Promise<{ applied: number; skipped: number }> {
    let applied = 0
    let skipped = 0
    this.db.transaction(() => {
      for (const change of changes) {
        if (this.isLocalNewer(change)) {
          skipped++
          continue
        }
        this.applyChange(change)
        this.setSynced(change, change.updatedAtMs)
        applied++
      }
    })
    return { applied, skipped }
  }

  private isLocalNewer(change: SyncChange): boolean {
    const row = this.db
      .prepare(`SELECT updated_at_ms FROM sync_outbox WHERE entity = ? AND entity_key = ?`)
      .get(change.entity, change.entityKey) as { updated_at_ms: number } | undefined
    return row !== undefined && row.updated_at_ms >= change.updatedAtMs
  }

  private setSynced(change: SyncChange, updatedAtMs: number): void {
    this.db
      .prepare(
        `INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(entity, entity_key) DO UPDATE SET
           op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = excluded.synced`,
      )
      .run(change.entity, change.entityKey, change.op, updatedAtMs)
  }

  private buildChange(row: OutboxRow): SyncChange {
    const base = {
      entity: row.entity,
      entityKey: row.entity_key,
      op: row.op,
      updatedAtMs: row.updated_at_ms,
      deviceId: this.deviceId,
    }
    if (row.op === 'delete') return base
    if (row.entity === 'document') return { ...base, document: this.documentPayload(row) }
    if (row.entity === 'tag') return { ...base, tag: this.tagPayload(row) }
    return { ...base, assignment: this.assignmentPayload(row) }
  }

  private documentPayload(row: OutboxRow): SyncChange['document'] {
    const doc = this.db
      .prepare(
        `SELECT id, source_id, path, filename, ext, mime_type, size_bytes, hash_sha256, status,
                title, content_preview, ocr_confidence, language, version, is_duplicate_of,
                file_mtime_ms, added_at, updated_at, deleted_at
         FROM documents WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(Number(row.entity_key)) as DocumentRow | undefined
    if (!doc) return undefined
    const contentRow = this.db
      .prepare(`SELECT content, content_hash FROM document_contents WHERE document_id = ?`)
      .get(doc.id) as { content: string; content_hash: string } | undefined
    return {
      localId: doc.id,
      filename: doc.filename,
      ext: doc.ext,
      mimeType: doc.mime_type,
      sizeBytes: doc.size_bytes,
      hashSha256: doc.hash_sha256,
      status: doc.status,
      title: doc.title,
      contentPreview: doc.content_preview,
      ocrConfidence: doc.ocr_confidence,
      language: doc.language,
      version: doc.version,
      addedAt: doc.added_at,
      content: contentRow?.content ?? null,
      contentHash: contentRow?.content_hash ?? null,
    }
  }

  private tagPayload(row: OutboxRow): SyncChange['tag'] {
    const tag = this.db
      .prepare(`SELECT id, name, color, created_at FROM tags WHERE id = ?`)
      .get(Number(row.entity_key)) as TagRow | undefined
    if (!tag) return undefined
    return { localId: tag.id, name: tag.name, color: tag.color, createdAt: tag.created_at }
  }

  private assignmentPayload(row: OutboxRow): SyncChange['assignment'] {
    const [documentId, tagId] = row.entity_key.split(':')
    const dt = this.db
      .prepare(`SELECT document_id, tag_id FROM document_tags WHERE document_id = ? AND tag_id = ?`)
      .get(Number(documentId), Number(tagId)) as { document_id: number; tag_id: number } | undefined
    if (!dt) return undefined
    return { documentId: dt.document_id, tagId: dt.tag_id }
  }

  private applyChange(change: SyncChange): void {
    if (change.entity === 'document') this.applyDocument(change)
    else if (change.entity === 'tag') this.applyTag(change)
    else this.applyAssignment(change)
  }

  private applyDocument(change: SyncChange): void {
    const data = change.document
    const localId = this.mapId('document', change.deviceId, change.entityKey)
    if (change.op === 'delete') {
      if (localId !== null) {
        this.db.prepare(`UPDATE documents SET deleted_at = datetime('now') WHERE id = ?`).run(localId)
      }
      return
    }
    if (!data) return
    let id = localId
    if (id === null) {
      id = this.insertDocument(data)
      this.recordMapping('document', change.deviceId, change.entityKey, id)
    }
    this.db
      .prepare(
        `UPDATE documents SET
           filename = ?, ext = ?, mime_type = ?, size_bytes = ?, hash_sha256 = ?,
           status = ?, title = ?, content_preview = substr(?, 1, 500), ocr_confidence = ?,
           language = ?, version = ?, added_at = COALESCE(?, added_at), updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        data.filename,
        data.ext,
        data.mimeType,
        data.sizeBytes,
        data.hashSha256,
        data.status,
        data.title,
        data.contentPreview ?? '',
        data.ocrConfidence,
        data.language,
        data.version,
        data.addedAt,
        id,
      )
    if (data.content !== null && data.contentHash !== null) {
      this.db
        .prepare(
          `INSERT INTO document_contents (document_id, content, content_hash, fts_indexed_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(document_id) DO UPDATE SET
             content = excluded.content, content_hash = excluded.content_hash`,
        )
        .run(id, data.content, data.contentHash)
    }
  }

  private insertDocument(data: NonNullable<SyncChange['document']>): number {
    const existing = this.db
      .prepare(`SELECT id FROM documents WHERE id = ?`)
      .get(data.localId) as { id: number } | undefined
    const id = existing ? undefined : data.localId
    const info = this.db
      .prepare(
        `INSERT INTO documents
           (id, source_id, path, filename, ext, mime_type, size_bytes, hash_sha256, status,
            title, content_preview, ocr_confidence, language, version, added_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, substr(?, 1, 500), ?, ?, ?, COALESCE(?, datetime('now')))`,
      )
      .run(
        id ?? null,
        `/sync/${this.deviceId}/${data.localId}`,
        data.filename,
        data.ext,
        data.mimeType,
        data.sizeBytes,
        data.hashSha256,
        data.status,
        data.title,
        data.contentPreview ?? '',
        data.ocrConfidence,
        data.language,
        data.version,
        data.addedAt,
      )
    return Number(info.lastInsertRowid)
  }

  private applyTag(change: SyncChange): void {
    const data = change.tag
    const localId = this.mapId('tag', change.deviceId, change.entityKey)
    if (change.op === 'delete') {
      if (localId !== null) {
        this.db.prepare(`DELETE FROM tags WHERE id = ?`).run(localId)
      }
      return
    }
    if (!data) return
    let id = localId
    if (id === null) {
      id = this.insertTag(data)
      this.recordMapping('tag', change.deviceId, change.entityKey, id)
    }
    this.db
      .prepare(`UPDATE tags SET name = ?, color = ? WHERE id = ?`)
      .run(data.name, data.color, id)
  }

  private insertTag(data: NonNullable<SyncChange['tag']>): number {
    const existing = this.db
      .prepare(`SELECT id FROM tags WHERE id = ?`)
      .get(data.localId) as { id: number } | undefined
    const id = existing ? undefined : data.localId
    const info = this.db
      .prepare(`INSERT INTO tags (id, name, color) VALUES (?, ?, ?)`)
      .run(id ?? null, data.name, data.color ?? null)
    return Number(info.lastInsertRowid)
  }

  private applyAssignment(change: SyncChange): void {
    const data = change.assignment
    if (!data) return
    const documentId = this.mapId('document', change.deviceId, String(data.documentId))
    const tagId = this.mapId('tag', change.deviceId, String(data.tagId))
    if (documentId === null || tagId === null) return
    if (change.op === 'delete') {
      this.db.prepare(`DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?`).run(documentId, tagId)
      return
    }
    this.db
      .prepare(`INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)`)
      .run(documentId, tagId)
  }

  private mapId(entity: SyncEntity, deviceId: string, localId: string): number | null {
    const row = this.db
      .prepare(`SELECT mapped_id FROM sync_meta WHERE entity = ? AND device_id = ? AND local_id = ?`)
      .get(entity, deviceId, localId) as SyncMetaRow | undefined
    if (row) return row.mapped_id
    return null
  }

  private recordMapping(entity: SyncEntity, deviceId: string, localId: string, mappedId: number): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sync_meta (entity, device_id, local_id, mapped_id) VALUES (?, ?, ?, ?)`,
      )
      .run(entity, deviceId, localId, mappedId)
  }
}
