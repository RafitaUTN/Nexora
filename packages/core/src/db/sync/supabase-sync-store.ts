import type { SyncChange, SyncEntity } from '@documind/domain'
import type { SyncRemoteStore } from '@documind/domain'

export interface SupabaseSyncStoreConfig {
  /** URL base del proyecto, p. ej. `https://xxxx.supabase.co` (sin barra final). */
  url: string
  /** Clave publicable (anon) del proyecto. */
  anonKey: string
  /** Identificador de instalación; sus filas se excluyen en el pull. */
  deviceId: string
  /**
   * Token de acceso del usuario autenticado (JWT de Supabase Auth). Si falta,
   * las peticiones van como anónimas y RLS las rechaza en las tablas de datos.
   */
  accessToken?: string
  /** `sub` del token: se escribe en la columna `user_id` para las políticas RLS. */
  userId?: string
  fetchImpl?: typeof fetch
}

type RestRow = Record<string, unknown>

interface TableSpec {
  entity: SyncEntity
  table: string
  conflict: string
}

const TABLES: TableSpec[] = [
  { entity: 'document', table: 'sync_documents', conflict: 'device_id,local_id' },
  { entity: 'tag', table: 'sync_tags', conflict: 'device_id,local_id' },
  { entity: 'assignment', table: 'sync_document_tags', conflict: 'device_id,document_id,tag_id' },
]

/**
 * Almacén remoto sobre Supabase (PostgREST) usando `fetch` únicamente.
 *
 * - `push`: UPSERT con `on_conflict` y `Prefer: resolution=merge-duplicates`;
 *   los tombstones (`op: delete`) envían una fila mínima que solo actualiza
 *   `deleted_at_ms` y conserva el resto de columnas.
 * - `pull`: filas con `updated_at_ms > sinceMs` de otros dispositivos.
 */
export class SupabaseSyncStore implements SyncRemoteStore {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: SupabaseSyncStoreConfig) {
    this.baseUrl = config.url.replace(/\/+$/, '')
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  private headers(): Record<string, string> {
    const token = this.config.accessToken ?? this.config.anonKey
    return {
      apikey: this.config.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async ping(): Promise<void> {
    await this.request<unknown>(`/rest/v1/sync_meta?select=device_id&limit=1`, { method: 'GET' })
  }

  async push(changes: SyncChange[]): Promise<void> {
    for (const spec of TABLES) {
      const rows = changes.filter((c) => c.entity === spec.entity)
      if (rows.length === 0) continue
      const body = rows.map((c) => this.toRow(spec.entity, c))
      await this.request(`/rest/v1/${spec.table}?on_conflict=${spec.conflict}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Prefer: 'resolution=merge-duplicates' },
      })
    }
  }

  async pull(sinceMs: number): Promise<SyncChange[]> {
    const changes: SyncChange[] = []
    for (const spec of TABLES) {
      const rows = await this.request<RestRow[]>(
        `/rest/v1/${spec.table}?select=*&updated_at_ms=gt.${sinceMs}&device_id=neq.${encodeURIComponent(
          this.config.deviceId,
        )}&order=updated_at_ms.asc`,
        { method: 'GET' },
      )
      for (const row of rows) {
        const change = this.fromRow(spec.entity, row)
        if (change) changes.push(change)
      }
    }
    return changes
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers as Record<string, string> | undefined) },
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Supabase respondió ${response.status}: ${body || response.statusText} (ERR_SYNC_REMOTE)`)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  private toRow(entity: SyncEntity, change: SyncChange): RestRow {
    const key = Number(change.entityKey.split(':')[0])
    const base: RestRow = {
      device_id: this.config.deviceId,
      user_id: this.config.userId ?? null,
      updated_at_ms: change.updatedAtMs,
    }
    if (change.op === 'delete') {
      return { ...base, ...this.deleteKey(entity, change), deleted_at_ms: change.updatedAtMs }
    }
    if (entity === 'document') {
      return {
        ...base,
        local_id: key,
        filename: change.document?.filename ?? '',
        ext: change.document?.ext ?? '',
        mime_type: change.document?.mimeType ?? null,
        size_bytes: change.document?.sizeBytes ?? 0,
        hash_sha256: change.document?.hashSha256 ?? '',
        status: change.document?.status ?? 'pending',
        title: change.document?.title ?? null,
        content_preview: change.document?.contentPreview ?? null,
        ocr_confidence: change.document?.ocrConfidence ?? null,
        language: change.document?.language ?? null,
        version: change.document?.version ?? 1,
        added_at: change.document?.addedAt ?? null,
        content: change.document?.content ?? null,
        content_hash: change.document?.contentHash ?? null,
        deleted_at_ms: null,
      }
    }
    if (entity === 'tag') {
      return {
        ...base,
        local_id: key,
        name: change.tag?.name ?? '',
        color: change.tag?.color ?? null,
        created_at: change.tag?.createdAt ?? null,
        deleted_at_ms: null,
      }
    }
    return {
      ...base,
      document_id: change.assignment?.documentId ?? 0,
      tag_id: change.assignment?.tagId ?? 0,
      deleted_at_ms: null,
    }
  }

  private deleteKey(entity: SyncEntity, change: SyncChange): RestRow {
    if (entity === 'assignment') {
      const [documentId, tagId] = change.entityKey.split(':')
      return { document_id: Number(documentId), tag_id: Number(tagId) }
    }
    return { local_id: Number(change.entityKey) }
  }

  private fromRow(entity: SyncEntity, row: RestRow): SyncChange | null {
    const updatedAtMs = Number(row.updated_at_ms)
    const deletedAtMs = row.deleted_at_ms == null ? null : Number(row.deleted_at_ms)
    const op = deletedAtMs === null ? 'upsert' : 'delete'
    const deviceId = String(row.device_id)
    if (entity === 'assignment') {
      const documentId = Number(row.document_id)
      const tagId = Number(row.tag_id)
      return {
        entity,
        entityKey: `${documentId}:${tagId}`,
        op,
        updatedAtMs: deletedAtMs ?? updatedAtMs,
        deviceId,
        assignment: op === 'delete' ? undefined : { documentId, tagId },
      }
    }
    const localId = Number(row.local_id)
    const change: SyncChange = {
      entity,
      entityKey: String(localId),
      op,
      updatedAtMs: deletedAtMs ?? updatedAtMs,
      deviceId,
    }
    if (op === 'delete') return change
    if (entity === 'document') {
      change.document = {
        localId,
        filename: String(row.filename ?? ''),
        ext: String(row.ext ?? ''),
        mimeType: row.mime_type == null ? null : String(row.mime_type),
        sizeBytes: Number(row.size_bytes ?? 0),
        hashSha256: String(row.hash_sha256 ?? ''),
        status: String(row.status ?? 'pending'),
        title: row.title == null ? null : String(row.title),
        contentPreview: row.content_preview == null ? null : String(row.content_preview),
        ocrConfidence: row.ocr_confidence == null ? null : Number(row.ocr_confidence),
        language: row.language == null ? null : String(row.language),
        version: Number(row.version ?? 1),
        addedAt: row.added_at == null ? null : String(row.added_at),
        content: row.content == null ? null : String(row.content),
        contentHash: row.content_hash == null ? null : String(row.content_hash),
      }
    } else {
      change.tag = {
        localId,
        name: String(row.name ?? ''),
        color: row.color == null ? null : String(row.color),
        createdAt: row.created_at == null ? null : String(row.created_at),
      }
    }
    return change
  }
}
