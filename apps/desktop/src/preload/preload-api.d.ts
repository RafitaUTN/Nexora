import type {
  AppSettings,
  AuditEntry,
  Automation,
  Classification,
  DocumentFilter,
  DocumentSource,
  DocumentStats,
  DocumentSummary,
  HistoryEntry,
  License,
  LicenseKey,
  NewAutomation,
  NewSource,
  NewTag,
  PagedResult,
  PublicUser,
  RegisterUserInput,
  Role,
  SyncResult,
  SyncStatus,
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

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  latestVersion?: string
  progress?: number
  message?: string
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
    importPaths(paths: string[]): Promise<ScanResult>
  }
  files: {
    getPath(file: File): string
  }
  documents: {
    list(filter?: Partial<DocumentFilter>): Promise<PagedResult<DocumentSummary>>
    get(id: number): Promise<DocumentDetail | null>
    delete(id: number): Promise<{ id: number }>
    stats(): Promise<DocumentStats>
    history(id: number): Promise<HistoryEntry[]>
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
  automations: {
    list(): Promise<Automation[]>
    create(input: NewAutomation): Promise<Automation>
    setEnabled(id: number, enabled: boolean): Promise<{ id: number; enabled: boolean }>
    remove(id: number): Promise<{ id: number }>
  }
  audit: {
    list(limit?: number, cursor?: number): Promise<AuditEntry[]>
  }
  auth: {
    status(): Promise<{ hasUsers: boolean; currentUser: PublicUser | null }>
    setup(input: RegisterUserInput): Promise<PublicUser>
    register(input: RegisterUserInput): Promise<PublicUser>
    login(username: string, password: string): Promise<PublicUser>
    logout(): Promise<{ ok: boolean }>
    listUsers(): Promise<PublicUser[]>
    setRole(userId: number, role: Role): Promise<PublicUser>
    changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }>
    deleteUser(userId: number): Promise<{ ok: boolean }>
  }
  updates: {
    check(): Promise<UpdateStatus>
    install(): Promise<{ ok: boolean }>
    state(): Promise<UpdateStatus>
  }
  license: {
    status(): Promise<License>
    activate(key: LicenseKey): Promise<License>
    deactivate(): Promise<{ ok: boolean }>
  }
  sync: {
    status(): Promise<SyncStatus>
    setEnabled(enabled: boolean): Promise<SyncStatus>
    configure(url: string, anonKey: string): Promise<SyncStatus>
    run(): Promise<SyncResult>
    ping(): Promise<{ ok: boolean }>
  }
  on<T>(channel: IpcEvent, callback: (payload: T) => void): () => void
}

declare global {
  interface Window {
    api: DocuMindApi
  }
}

export {}
