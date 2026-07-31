import type {
  AuditEntry,
  Classification,
  Document,
  DocumentSource,
  DocumentSummary,
  ExtractedEntity,
  HistoryEntry,
  Tag,
  TagStats,
} from '@documind/domain'

export interface DocumentRow {
  id: number
  source_id: number | null
  path: string
  filename: string
  ext: string
  mime_type: string | null
  size_bytes: number
  hash_sha256: string
  status: Document['status']
  title: string | null
  content_preview: string | null
  ocr_confidence: number | null
  language: string | null
  version: number
  is_duplicate_of: number | null
  file_mtime_ms: number | null
  added_at: string
  updated_at: string
  deleted_at: string | null
}

export function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    sourceId: row.source_id,
    path: row.path,
    filename: row.filename,
    ext: row.ext,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    hashSha256: row.hash_sha256,
    status: row.status,
    title: row.title,
    contentPreview: row.content_preview,
    ocrConfidence: row.ocr_confidence,
    language: row.language,
    version: row.version,
    isDuplicateOf: row.is_duplicate_of,
    fileMtimeMs: row.file_mtime_ms,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function toDocumentSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    sourceId: row.source_id,
    path: row.path,
    filename: row.filename,
    ext: row.ext,
    sizeBytes: row.size_bytes,
    status: row.status,
    title: row.title,
    ocrConfidence: row.ocr_confidence,
    language: row.language,
    isDuplicateOf: row.is_duplicate_of,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  }
}

export interface TagRow {
  id: number
  name: string
  color: string | null
  created_at: string
}

export function toTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, color: row.color, createdAt: row.created_at }
}

export function toTagStats(row: TagRow & { count: number }): TagStats {
  return { id: row.id, name: row.name, color: row.color, count: row.count }
}

export interface SourceRow {
  id: number
  path: string
  name: string
  kind: DocumentSource['kind']
  scan_mode: DocumentSource['scanMode']
  enabled: number
  last_scan_at: string | null
  created_at: string
}

export function toSource(row: SourceRow): DocumentSource {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    kind: row.kind,
    scanMode: row.scan_mode,
    enabled: row.enabled === 1,
    lastScanAt: row.last_scan_at,
    createdAt: row.created_at,
  }
}

export interface HistoryRow {
  id: number
  document_id: number | null
  action: HistoryEntry['action']
  detail: string | null
  actor: string
  created_at: string
}

export function toHistoryEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    documentId: row.document_id,
    action: row.action,
    detail: row.detail,
    actor: row.actor,
    createdAt: row.created_at,
  }
}

export interface AuditRow {
  id: number
  actor: string
  action: string
  entity_type: string | null
  entity_id: string | null
  detail: string | null
  created_at: string
}

export function toAuditEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: row.detail,
    createdAt: row.created_at,
  }
}

export interface ClassificationRow {
  document_id: number
  category: string
  confidence: number
  provider: string
  model: string
  cached: number
  created_at: string
}

export function toClassification(row: ClassificationRow): Classification {
  return {
    documentId: row.document_id,
    category: row.category,
    confidence: row.confidence,
    provider: row.provider,
    model: row.model,
    cached: row.cached === 1,
    createdAt: row.created_at,
  }
}

export interface EntityRow {
  kind: ExtractedEntity['kind']
  value: string
  confidence: number | null
}

export function toExtractedEntity(row: EntityRow): ExtractedEntity {
  return { kind: row.kind, value: row.value, confidence: row.confidence ?? 0 }
}
