import type {
  AppSettings,
  Classification,
  DocumentFilter,
  DocumentSource,
  DocumentStats,
  DocumentSummary,
  NewSource,
  NewTag,
  PagedResult,
  Tag,
} from '@documind/domain'
import type { IpcEvent } from '@documind/shared'

export interface SystemInfo {
  name: string
  version: string
  platform: string
  arch: string
}

export interface DocumentDetail {
  document: DocumentSummary
  content: string | null
  tags: Tag[]
  classification: Classification | null
}

export interface ProviderHealthView {
  ok: boolean
  latencyMs: number
  error?: string
}

export interface OcrHealthView {
  ok: boolean
  engine: string
  error: string | null
}

export interface ApiKeyStatus {
  provider: string
  set: boolean
}

export interface BackupEntry {
  name: string
  createdAt: string
  sizeBytes: number
}

export interface ScanResult {
  scanned: number
  indexed: number
  errors: string[]
}

export interface DocuMindApi {
  system: {
    info(): Promise<SystemInfo>
    ping(): Promise<{ pong: boolean }>
    selectFolder(): Promise<string | null>
    selectFile(): Promise<string | null>
  }
  documents: {
    list(filter?: Partial<DocumentFilter>): Promise<PagedResult<DocumentSummary>>
    get(id: number): Promise<DocumentDetail | null>
    delete(id: number): Promise<{ id: number }>
    stats(): Promise<DocumentStats>
  }
  sources: {
    list(): Promise<DocumentSource[]>
    add(input: NewSource): Promise<DocumentSource>
    remove(id: number): Promise<{ id: number }>
    rescan(id: number): Promise<ScanResult>
  }
  search: {
    query(
      query: string,
      limit?: number,
      filter?: { ext?: string; tagId?: number },
    ): Promise<PagedResult<{ document: DocumentSummary; score: number }>>
  }
  tags: {
    list(): Promise<(Tag & { count: number })[]>
    create(input: NewTag): Promise<Tag>
    assign(tagId: number, documentId: number): Promise<{ ok: boolean }>
    remove(tagId: number, documentId: number): Promise<{ ok: boolean }>
    delete(id: number): Promise<{ id: number }>
  }
  ai: {
    classify(documentId: number): Promise<Classification | null>
    usage(): Promise<{
      totalCalls: number
      totalTokens: number
      totalCostUsd: number
      cachedHits: number
    }>
    health(): Promise<ProviderHealthView>
    setApiKey(provider: string, apiKey: string): Promise<{ provider: string }>
    deleteApiKey(provider: string): Promise<{ provider: string }>
    apiKeyStatus(provider: string): Promise<ApiKeyStatus>
  }
  ocr: {
    health(): Promise<OcrHealthView>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  backups: {
    create(): Promise<BackupEntry>
    list(): Promise<BackupEntry[]>
    restore(name: string): Promise<{ ok: boolean }>
  }
  updates: {
    check(): Promise<unknown>
    install(): Promise<{ ok: boolean }>
    state(): Promise<unknown>
  }
  on<T>(channel: IpcEvent, callback: (payload: T) => void): () => void
}

declare global {
  interface Window {
    api: DocuMindApi
  }
}

export {}
