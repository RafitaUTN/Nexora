import type {
  AiCacheRepository,
  AiUsageRepository,
  AuditRepository,
  AutomationRepository,
  ClassificationRepository,
  DocumentRepository,
  SearchRepository,
  SettingsRepository,
  TagRepository,
} from '../ports/repositories'
import type {
  Automation,
  NewAutomation,
} from '../entities/automation'
import type { AuditEntry, HistoryEntry, NewAuditEntry, NewHistoryEntry } from '../entities/audit'
import type { Classification, ExtractedEntity } from '../entities/classification'
import type { Document, DocumentFilter, DocumentStats, DocumentSummary, NewDocument, PagedResult } from '../entities/document'
import type { NewTag, Tag, TagStats } from '../entities/tag'
import type { AppSettings } from '../entities/settings'
import type { NewUser, Role, User } from '../entities/user'
import type { EventBus, EventMap, EventName } from '../ports/event-bus'
import type { PasswordHasher } from '../ports/password-hasher'
import type { SessionRepository, UserRepository } from '../ports/repositories'
import type { SessionTokenService } from '../ports/session-token'
import type { License, LicensePayload } from '../entities/license'
import type { LicenseRepository, LicenseServer, LicenseVerifier } from '../ports/license'

export class FakeEventBus implements EventBus {
  readonly emitted: { event: EventName; payload: unknown }[] = []
  private readonly handlers = new Map<EventName, Set<(payload: never) => void | Promise<void>>>()

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    this.emitted.push({ event, payload })
    for (const handler of this.handlers.get(event) ?? []) {
      void Promise.resolve(handler(payload as never)).catch(() => undefined)
    }
  }

  on<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void | Promise<void>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as (payload: never) => void | Promise<void>)
    return () => set?.delete(handler as (payload: never) => void | Promise<void>)
  }

  clear(): void {
    this.handlers.clear()
    this.emitted.length = 0
  }

  eventsOf(name: EventName): unknown[] {
    return this.emitted.filter((e) => e.event === name).map((e) => e.payload)
  }
}

export class FakeSettingsRepository implements SettingsRepository {
  private readonly data = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value)
  }
}

export class FakeTagRepository implements TagRepository {
  tags: Tag[] = []
  assignments: { tagId: number; documentId: number }[] = []
  private nextId = 1

  async list(): Promise<Tag[]> {
    return [...this.tags]
  }

  async listWithStats(): Promise<TagStats[]> {
    return this.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      count: this.assignments.filter((a) => a.tagId === tag.id).length,
    }))
  }

  async findByName(name: string): Promise<Tag | null> {
    return this.tags.find((t) => t.name === name) ?? null
  }

  async create(tag: NewTag): Promise<Tag> {
    const created: Tag = {
      id: this.nextId++,
      name: tag.name,
      color: tag.color ?? null,
      createdAt: new Date().toISOString(),
    }
    this.tags.push(created)
    return created
  }

  async assign(tagId: number, documentId: number): Promise<void> {
    this.assignments.push({ tagId, documentId })
  }

  async unassign(tagId: number, documentId: number): Promise<void> {
    this.assignments = this.assignments.filter(
      (a) => a.tagId !== tagId || a.documentId !== documentId,
    )
  }

  async listByDocument(documentId: number): Promise<Tag[]> {
    return this.tags.filter((t) => this.assignments.some((a) => a.tagId === t.id && a.documentId === documentId))
  }

  async delete(id: number): Promise<void> {
    this.tags = this.tags.filter((t) => t.id !== id)
  }
}

export class FakeAuditRepository implements AuditRepository {
  entries: AuditEntry[] = []
  private nextId = 1

  async add(entry: NewAuditEntry): Promise<void> {
    this.entries.push({
      id: this.nextId++,
      actor: entry.actor ?? 'system',
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      detail: entry.detail ?? null,
      createdAt: new Date().toISOString(),
    })
  }

  async list(limit: number, cursor?: number): Promise<AuditEntry[]> {
    const sorted = [...this.entries].reverse()
    const start = cursor ? sorted.findIndex((e) => e.id === cursor) + 1 : 0
    return sorted.slice(start, start + limit)
  }
}

export class FakeAutomationRepository implements AutomationRepository {
  automations: Automation[] = []
  runs: { automationId: number; documentId: number; ok: boolean; detail: string }[] = []
  private nextId = 1

  async list(enabledOnly?: boolean): Promise<Automation[]> {
    return this.automations.filter((a) => !enabledOnly || a.enabled)
  }

  async create(input: NewAutomation): Promise<Automation> {
    const now = new Date().toISOString()
    const automation: Automation = {
      id: this.nextId++,
      name: input.name,
      enabled: input.enabled,
      triggerType: input.triggerType,
      action: input.action,
      createdAt: now,
      updatedAt: now,
    }
    this.automations.push(automation)
    return automation
  }

  async updateEnabled(id: number, enabled: boolean): Promise<void> {
    const found = this.automations.find((a) => a.id === id)
    if (found) found.enabled = enabled
  }

  async delete(id: number): Promise<void> {
    this.automations = this.automations.filter((a) => a.id !== id)
  }

  async recordRun(automationId: number, documentId: number, ok: boolean, detail: string): Promise<void> {
    this.runs.push({ automationId, documentId, ok, detail })
  }
}

export class FakeDocumentRepository implements DocumentRepository {
  docs: Document[] = []
  contents = new Map<number, string>()
  history: NewHistoryEntry[] = []
  versions: { documentId: number; version: number; path: string; hash: string; size: number }[] = []
  private nextId = 1

  async save(doc: NewDocument): Promise<Document> {
    const now = new Date().toISOString()
    const created: Document = {
      id: this.nextId++,
      sourceId: doc.sourceId,
      path: doc.path,
      filename: doc.filename,
      ext: doc.ext,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      hashSha256: doc.hashSha256,
      status: 'pending',
      title: null,
      contentPreview: null,
      ocrConfidence: null,
      language: null,
      version: 1,
      isDuplicateOf: null,
      fileMtimeMs: doc.fileMtimeMs,
      addedAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    this.docs.push(created)
    return created
  }

  async updateStatus(id: number, status: Document['status']): Promise<void> {
    const found = this.docs.find((d) => d.id === id)
    if (found) found.status = status
  }

  async updateContentPreview(id: number, preview: string): Promise<void> {
    const found = this.docs.find((d) => d.id === id)
    if (found) found.contentPreview = preview
  }

  async setDuplicate(id: number, duplicateOf: number): Promise<void> {
    const found = this.docs.find((d) => d.id === id)
    if (found) found.isDuplicateOf = duplicateOf
  }

  async findById(id: number): Promise<Document | null> {
    return this.docs.find((d) => d.id === id) ?? null
  }

  async findByPath(sourceId: number | null, path: string): Promise<Document | null> {
    return this.docs.find((d) => d.sourceId === sourceId && d.path === path) ?? null
  }

  async findByHash(hash: string): Promise<Document[]> {
    return this.docs.filter((d) => d.hashSha256 === hash)
  }

  async list(_filter: DocumentFilter): Promise<PagedResult<Document>> {
    const items = this.docs.filter((d) => !d.deletedAt)
    return { items, nextCursor: null, hasMore: false }
  }

  async stats(): Promise<DocumentStats> {
    return {
      total: this.docs.length,
      indexed: 0,
      pending: this.docs.length,
      duplicates: this.docs.filter((d) => d.isDuplicateOf !== null).length,
      errors: 0,
      totalSizeBytes: this.docs.reduce((sum, d) => sum + d.sizeBytes, 0),
      byExt: {},
    }
  }

  async remove(id: number): Promise<void> {
    this.docs = this.docs.filter((d) => d.id !== id)
  }

  async markDeleted(id: number): Promise<void> {
    const found = this.docs.find((d) => d.id === id)
    if (found) found.deletedAt = new Date().toISOString()
  }

  async setContent(id: number, content: string): Promise<void> {
    this.contents.set(id, content)
  }

  async getContent(id: number): Promise<string | null> {
    return this.contents.get(id) ?? null
  }

  async addVersion(documentId: number, version: number, path: string, hash: string, size: number, _note?: string): Promise<void> {
    this.versions.push({ documentId, version, path, hash, size })
  }

  async bumpVersion(id: number): Promise<number> {
    const found = this.docs.find((d) => d.id === id)
    if (found) found.version += 1
    return found?.version ?? 1
  }

  async addHistory(entry: NewHistoryEntry): Promise<void> {
    this.history.push(entry)
  }

  async listHistory(documentId: number, limit: number): Promise<HistoryEntry[]> {
    return this.history
      .filter((h) => h.documentId === documentId)
      .slice(0, limit)
      .map((h, i) => ({
        id: i + 1,
        documentId: h.documentId,
        action: h.action,
        detail: h.detail ?? null,
        actor: h.actor ?? 'system',
        createdAt: new Date().toISOString(),
      }))
  }
}

export class FakeClassificationRepository implements ClassificationRepository {
  saved: Classification | null = null
  entities: ExtractedEntity[] = []

  async save(classification: Classification): Promise<void> {
    this.saved = classification
  }

  async findByDocumentId(documentId: number): Promise<Classification | null> {
    return this.saved?.documentId === documentId ? this.saved : null
  }

  async saveEntities(documentId: number, entities: ExtractedEntity[]): Promise<void> {
    this.entities = entities
  }

  async listEntities(_documentId: number): Promise<ExtractedEntity[]> {
    return this.entities
  }
}

export class FakeAiCacheRepository implements AiCacheRepository {
  private readonly cache = new Map<string, string>()

  async get(requestHash: string): Promise<string | null> {
    return this.cache.get(requestHash) ?? null
  }

  async set(requestHash: string, response: string, _ttlSeconds?: number): Promise<void> {
    this.cache.set(requestHash, response)
  }
}

export class FakeAiUsageRepository implements AiUsageRepository {
  records: Parameters<AiUsageRepository['record']>[0][] = []

  async record(usage: Parameters<AiUsageRepository['record']>[0]): Promise<void> {
    this.records.push(usage)
  }

  async summarize(): Promise<{ totalCalls: number; totalTokens: number; totalCostUsd: number; cachedHits: number }> {
    return {
      totalCalls: this.records.length,
      totalTokens: this.records.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0),
      totalCostUsd: this.records.reduce((s, r) => s + r.estCostUsd, 0),
      cachedHits: 0,
    }
  }
}

export class FakeSearchRepository implements SearchRepository {
  hits: { document: DocumentSummary; score: number }[] = []

  async fullText(
    _query: string,
    limit: number,
    _filter?: { ext?: string; tagId?: number },
  ): Promise<{ document: DocumentSummary; score: number }[]> {
    return this.hits.slice(0, limit)
  }
}

export function makeDocumentSummary(overrides: Partial<Document> = {}): DocumentSummary {
  return {
    id: 1,
    sourceId: null,
    path: '/docs/archivo.pdf',
    filename: 'archivo.pdf',
    ext: 'pdf',
    sizeBytes: 100,
    status: 'indexed',
    title: null,
    ocrConfidence: null,
    language: null,
    isDuplicateOf: null,
    addedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  }
}

export function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {  return {
    theme: 'system',
    language: 'es',
    ocrLanguages: ['spa', 'eng'],
    ocrMaxDpi: 300,
    ai: {
      provider: 'openrouter',
      model: '',
      tokenBudget: 8_000,
      sendWholeDocument: false,
      maxCacheAgeDays: 30,
      requestsPerMinute: 30,
    },
    updates: {
      autoCheck: true,
      autoDownload: true,
      channel: 'stable',
      checkIntervalHours: 4,
    },
    telemetry: false,
    ...overrides,
  }
}

export class FakePasswordHasher implements PasswordHasher {
  readonly hashed = new Map<string, string>()

  async hash(password: string): Promise<string> {
    const encoded = `$fake$${password}`
    this.hashed.set(encoded, password)
    return encoded
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    return this.hashed.get(encoded) === password
  }
}

export class FakeSessionTokenService implements SessionTokenService {
  readonly issued: string[] = []
  private counter = 0

  createToken(): string {
    const token = `tok_${++this.counter}_${Math.random().toString(36).slice(2)}`
    this.issued.push(token)
    return token
  }

  hashToken(token: string): string {
    return `hash(${token})`
  }
}

export class FakeUserRepository implements UserRepository {
  users: User[] = []
  private nextId = 1

  async create(user: Omit<NewUser, 'password'> & { passwordHash: string }): Promise<User> {
    const now = new Date().toISOString()
    const created: User = {
      id: this.nextId++,
      username: user.username,
      displayName: user.displayName,
      passwordHash: user.passwordHash,
      role: user.role,
      createdAt: now,
      updatedAt: now,
    }
    this.users.push(created)
    return created
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null
  }

  async findById(id: number): Promise<User | null> {
    return this.users.find((u) => u.id === id) ?? null
  }

  async list(): Promise<User[]> {
    return [...this.users]
  }

  async count(): Promise<number> {
    return this.users.length
  }

  async updateRole(id: number, role: Role): Promise<void> {
    const found = this.users.find((u) => u.id === id)
    if (found) found.role = role
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    const found = this.users.find((u) => u.id === id)
    if (found) found.passwordHash = passwordHash
  }

  async delete(id: number): Promise<void> {
    this.users = this.users.filter((u) => u.id !== id)
  }
}

export class FakeSessionRepository implements SessionRepository {
  sessions: { userId: number; tokenHash: string; expiresAt: string }[] = []

  async create(session: { userId: number; tokenHash: string; expiresAt: string }): Promise<void> {
    this.sessions.push(session)
  }

  async findByTokenHash(tokenHash: string): Promise<{ userId: number; expiresAt: string } | null> {
    const found = this.sessions.find((s) => s.tokenHash === tokenHash)
    return found ? { userId: found.userId, expiresAt: found.expiresAt } : null
  }

  async touch(tokenHash: string): Promise<void> {
    const found = this.sessions.find((s) => s.tokenHash === tokenHash)
    if (found) found.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.sessions = this.sessions.filter((s) => s.tokenHash !== tokenHash)
  }

  async deleteByUser(userId: number): Promise<void> {
    this.sessions = this.sessions.filter((s) => s.userId !== userId)
  }

  async deleteExpired(): Promise<void> {
    const now = Date.now()
    this.sessions = this.sessions.filter((s) => new Date(s.expiresAt).getTime() >= now)
  }
}

export class FakeLicenseRepository implements LicenseRepository {
  license: License | null = null

  async get(): Promise<License | null> {
    return this.license
  }

  async set(license: License): Promise<void> {
    this.license = { ...license }
  }

  async clear(): Promise<void> {
    this.license = null
  }
}

export class FakeLicenseVerifier implements LicenseVerifier {
  valid = true

  async verify(_payload: LicensePayload, _signature: string): Promise<boolean> {
    return this.valid
  }
}

export class FakeLicenseServer implements LicenseServer {
  result: { payload: LicensePayload; signature: string } | null = null
  error: Error | null = null
  deactivated = false
  readonly activatedKeys: string[] = []

  async activate(key: string, _deviceId: string): Promise<{ payload: LicensePayload; signature: string }> {
    this.activatedKeys.push(key)
    if (this.error) throw this.error
    if (!this.result) {
      throw new Error('No se pudo conectar con el servidor de licencias')
    }
    return { payload: { ...this.result.payload }, signature: this.result.signature }
  }

  async deactivate(_deviceId: string): Promise<void> {
    this.deactivated = true
  }
}
