import type {
  Document,
  DocumentFilter,
  DocumentStats,
  DocumentSummary,
  NewDocument,
  PagedResult,
} from '../entities/document'
import type { HistoryEntry, NewHistoryEntry, NewAuditEntry, AuditEntry } from '../entities/audit'
import type { Classification, ExtractedEntity } from '../entities/classification'
import type { Automation, NewAutomation } from '../entities/automation'
import type { NewSource, DocumentSource } from '../entities/source'
import type { NewTag, Tag, TagStats } from '../entities/tag'
import type { ProviderId } from '../entities/settings'

export interface DocumentRepository {
  save(doc: NewDocument): Promise<Document>
  updateStatus(id: number, status: Document['status']): Promise<void>
  updateContentPreview(id: number, preview: string): Promise<void>
  setDuplicate(id: number, duplicateOf: number): Promise<void>
  findById(id: number): Promise<Document | null>
  findByPath(sourceId: number | null, path: string): Promise<Document | null>
  findByHash(hash: string): Promise<Document[]>
  list(filter: DocumentFilter): Promise<PagedResult<DocumentSummary>>
  stats(): Promise<DocumentStats>
  remove(id: number): Promise<void>
  markDeleted(id: number): Promise<void>
  setContent(id: number, content: string): Promise<void>
  getContent(id: number): Promise<string | null>
  addVersion(
    documentId: number,
    version: number,
    path: string,
    hash: string,
    size: number,
    note?: string,
  ): Promise<void>
  bumpVersion(id: number): Promise<number>
  addHistory(entry: NewHistoryEntry): Promise<void>
  listHistory(documentId: number, limit: number): Promise<HistoryEntry[]>
}

export interface SourceRepository {
  list(): Promise<DocumentSource[]>
  add(source: NewSource): Promise<DocumentSource>
  remove(id: number): Promise<void>
  setLastScan(id: number, date: string): Promise<void>
}

export interface TagRepository {
  list(): Promise<Tag[]>
  listWithStats(): Promise<TagStats[]>
  findByName(name: string): Promise<Tag | null>
  create(tag: NewTag): Promise<Tag>
  assign(tagId: number, documentId: number): Promise<void>
  unassign(tagId: number, documentId: number): Promise<void>
  listByDocument(documentId: number): Promise<Tag[]>
  delete(id: number): Promise<void>
}

export interface ClassificationRepository {
  save(classification: Classification): Promise<void>
  findByDocumentId(documentId: number): Promise<Classification | null>
  saveEntities(documentId: number, entities: ExtractedEntity[]): Promise<void>
  listEntities(documentId: number): Promise<ExtractedEntity[]>
}

export interface SearchRepository {
  fullText(
    query: string,
    limit: number,
    filter?: { ext?: string; tagId?: number },
  ): Promise<{ document: DocumentSummary; score: number }[]>
}

export interface AuditRepository {
  add(entry: NewAuditEntry): Promise<void>
  list(limit: number, cursor?: number): Promise<AuditEntry[]>
}

export interface SettingsRepository {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

export interface AiUsageRepository {
  record(usage: {
    provider: ProviderId | string
    model: string
    task: string
    promptTokens: number
    completionTokens: number
    estCostUsd: number
    latencyMs: number
    cached: boolean
  }): Promise<void>
  summarize(): Promise<{
    totalCalls: number
    totalTokens: number
    totalCostUsd: number
    cachedHits: number
  }>
}

export interface AiCacheRepository {
  get(requestHash: string): Promise<string | null>
  set(requestHash: string, response: string, ttlSeconds?: number): Promise<void>
}

export interface OcrQueueRepository {
  enqueue(documentId: number, priority?: number): Promise<void>
  nextBatch(limit: number): Promise<{ id: number; documentId: number; priority: number }[]>
  markProcessing(id: number): Promise<void>
  markDone(id: number): Promise<void>
  markError(id: number): Promise<void>
  pendingCount(): Promise<number>
}

export interface AutomationRepository {
  list(enabledOnly?: boolean): Promise<Automation[]>
  create(automation: NewAutomation): Promise<Automation>
  updateEnabled(id: number, enabled: boolean): Promise<void>
  delete(id: number): Promise<void>
  recordRun(
    automationId: number,
    documentId: number,
    ok: boolean,
    detail: string,
  ): Promise<void>
}
