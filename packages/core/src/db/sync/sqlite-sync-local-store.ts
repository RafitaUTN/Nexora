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
  private currentUserId: string | null = null

  constructor(
    private readonly db: SqliteDatabase,
    private readonly deviceId: string,
    private readonly getCurrentUserId?: () => Promise<string | null>,
  ) {
    if (this.getCurrentUserId === undefined) {
      this.currentUserId = null
    }
  }

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

  async markSynced(changes: SyncChange[]): Promise<void> {
    this.db.transaction(() => {
      const mark = this.db.prepare(`UPDATE sync_outbox SET synced = 1 WHERE entity = ? AND entity_key = ?`)
      const baseline = this.db.prepare(
        `INSERT INTO sync_last_payload (entity, entity_key, payload, updated_at_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(entity, entity_key) DO UPDATE SET
           payload = excluded.payload, updated_at_ms = excluded.updated_at_ms`,
      )
      for (const change of changes) {
        mark.run(change.entity, change.entityKey)
        baseline.run(change.entity, change.entityKey, JSON.stringify(change), change.updatedAtMs)
      }
    })
  }

  async applyRemote(changes: SyncChange[]): Promise<{ applied: number; skipped: number }> {
    let applied = 0
    let skipped = 0
    this.currentUserId = this.getCurrentUserId ? await this.getCurrentUserId() : null
    this.db.transaction(() => {
      for (const change of changes) {
        if (this.tryMergeDocument(change)) {
          applied++
          continue
        }
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
    if (row.entity === 'share') return { ...base, share: this.sharePayload(row) }
    return { ...base, assignment: this.assignmentPayload(row) }
  }

  private documentPayload(row: OutboxRow): SyncChange['document'] {
    return this.documentPayloadById(Number(row.entity_key))
  }

  private documentPayloadById(id: number): SyncChange['document'] {
    const doc = this.db
      .prepare(
        `SELECT id, source_id, path, filename, ext, mime_type, size_bytes, hash_sha256, status,
                title, content_preview, ocr_confidence, language, version, is_duplicate_of,
                file_mtime_ms, added_at, updated_at, deleted_at
         FROM documents WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as DocumentRow | undefined
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

  private sharePayload(row: OutboxRow): SyncChange['share'] {
    const share = this.db
      .prepare(`SELECT id, uid, owner_email, member_email, role, status, created_at FROM shares WHERE uid = ?`)
      .get(row.entity_key) as
      | { id: number; uid: string; owner_email: string; member_email: string; role: string; status: string; created_at: string }
      | undefined
    if (!share) return undefined
    return {
      localId: share.id,
      uid: share.uid,
      ownerEmail: share.owner_email,
      memberEmail: share.member_email,
      role: share.role,
      status: share.status,
      createdAt: share.created_at,
    }
  }

  private applyChange(change: SyncChange): void {
    if (change.entity === 'document') this.applyDocument(change)
    else if (change.entity === 'tag') this.applyTag(change)
    else if (change.entity === 'share') this.applyShare(change)
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
    this.applyDocumentRow(data, id, this.isShared(change))
  }

  /**
   * Resolución de conflictos por campos (FASE 15.4).
   *
   * Cuando llega un cambio remoto de un documento con un cambio local
   * pendiente, se combina campo a campo en lugar de aplicar LWW por fila:
   * para cada campo se usa la línea base (`sync_last_payload`) para saber qué
   * lado lo modificó; si ambos lo modificaron, gana el lado con timestamp más
   * reciente. El resultado se aplica localmente y se deja pendiente para que
   * el siguiente ciclo lo suba (merge bidireccional). Devuelve `true` si
   * resolvió el conflicto y `false` si no aplica.
   */
  private tryMergeDocument(change: SyncChange): boolean {
    if (change.entity !== 'document' || change.op !== 'upsert' || !change.document) return false
    const localId = this.mapId('document', change.deviceId, change.entityKey)
    const candidates = new Set([change.entityKey])
    if (localId !== null) candidates.add(String(localId))
    const placeholders = [...candidates].map(() => '?').join(', ')
    const pending = this.db
      .prepare(
        `SELECT entity_key, op, updated_at_ms FROM sync_outbox
         WHERE entity = 'document' AND synced = 0 AND entity_key IN (${placeholders})
         ORDER BY updated_at_ms DESC LIMIT 1`,
      )
      .get(...candidates) as { entity_key: string; op: SyncOperation; updated_at_ms: number } | undefined
    if (!pending || pending.op !== 'upsert') return false
    const localData = this.documentPayloadById(Number(pending.entity_key))
    if (!localData) return false
    const remoteData = change.document
    const baseline = this.lastPayload(change.entity, pending.entity_key)
    const merged = this.mergeDocumentPayload(
      localData,
      remoteData,
      baseline,
      pending.updated_at_ms,
      change.updatedAtMs,
    )
    this.applyDocumentRow(merged, Number(pending.entity_key), this.isShared(change))
    this.db
      .prepare(
        `UPDATE sync_outbox SET op = 'upsert', updated_at_ms = ?, synced = 0
         WHERE entity = 'document' AND entity_key = ?`,
      )
      .run(Math.max(pending.updated_at_ms, change.updatedAtMs), pending.entity_key)
    return true
  }

  private applyDocumentRow(data: NonNullable<SyncChange['document']>, id: number, shared: number): void {
    this.db
      .prepare(
        `UPDATE documents SET
           filename = ?, ext = ?, mime_type = ?, size_bytes = ?, hash_sha256 = ?,
           status = ?, title = ?, content_preview = substr(?, 1, 500), ocr_confidence = ?,
           language = ?, version = ?, added_at = COALESCE(?, added_at), updated_at = datetime('now'),
           shared = ?
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
        shared,
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

  private mergeDocumentPayload(
    local: NonNullable<SyncChange['document']>,
    remote: NonNullable<SyncChange['document']>,
    baseline: NonNullable<SyncChange['document']> | null,
    localTs: number,
    remoteTs: number,
  ): NonNullable<SyncChange['document']> {
    const FIELDS: Array<keyof NonNullable<SyncChange['document']>> = [
      'filename',
      'ext',
      'mimeType',
      'sizeBytes',
      'hashSha256',
      'status',
      'title',
      'contentPreview',
      'ocrConfidence',
      'language',
      'version',
      'addedAt',
      'content',
      'contentHash',
    ]
    const result: NonNullable<SyncChange['document']> = { ...local }
    const target = result as Record<string, unknown>
    const changed = (side: NonNullable<SyncChange['document']>, field: (typeof FIELDS)[number]): boolean => {
      if (!baseline) return true
      return side[field] !== baseline[field]
    }
    for (const field of FIELDS) {
      const localChanged = changed(local, field)
      const remoteChanged = changed(remote, field)
      if (!remoteChanged) continue
      if (localChanged) {
        target[field] = remoteTs > localTs ? remote[field] : local[field]
      } else {
        target[field] = remote[field]
      }
    }
    return result
  }

  private lastPayload(entity: SyncEntity, entityKey: string): NonNullable<SyncChange['document']> | null {
    const row = this.db
      .prepare(`SELECT payload FROM sync_last_payload WHERE entity = ? AND entity_key = ?`)
      .get(entity, entityKey) as { payload: string } | undefined
    if (!row) return null
    try {
      return (JSON.parse(row.payload) as SyncChange).document ?? null
    } catch {
      return null
    }
  }

  private isShared(change: SyncChange): number {
    return change.ownerUserId != null && this.currentUserId != null && change.ownerUserId !== this.currentUserId
      ? 1
      : 0
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

  private applyShare(change: SyncChange): void {
    const data = change.share
    if (change.op === 'delete') {
      this.db.prepare(`DELETE FROM shares WHERE uid = ?`).run(change.entityKey)
      return
    }
    if (!data) return
    const existing = this.db
      .prepare(`SELECT id FROM shares WHERE uid = ?`)
      .get(change.entityKey) as { id: number } | undefined
    if (existing) {
      this.db
        .prepare(
          `UPDATE shares SET owner_email = ?, member_email = ?, role = ?, status = ?, updated_at = datetime('now') WHERE uid = ?`,
        )
        .run(data.ownerEmail, data.memberEmail, data.role, data.status, change.entityKey)
      return
    }
    this.db
      .prepare(
        `INSERT INTO shares (uid, owner_email, member_email, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
      )
      .run(change.entityKey, data.ownerEmail, data.memberEmail, data.role, data.status, data.createdAt)
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
