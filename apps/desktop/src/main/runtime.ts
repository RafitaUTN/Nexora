import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AIProvider,
  AppSettings,
  AutomationActions,
  DocumentSource,
  EventBus,
  FileWatcher,
  OCREngine,
} from '@documind/domain'
import {
  AuditService,
  AuthService,
  AutomationService,
  ClassificationService,
  DocumentService,
  LicenseService,
  QaService,
  SearchService,
  SettingsService,
  ShareService,
  SummarizeService,
  SyncService,
  TagService,
  SyncError,
  type Share,
  type ShareRole,
  type SyncChange,
  type SyncRemoteStore,
  type SyncStatus,
} from '@documind/domain'
import { createAIProvider } from '@documind/ai'
import { ExtractionService } from '@documind/document'
import { TesseractOcrEngine } from '@documind/ocr'
import {
  AesGcm,
  ConsoleLogger,
  CryptoLicenseVerifier,
  CryptoSessionTokens,
  HttpLicenseServer,
  InMemoryEventBus,
  IndexingService,
  ScryptPasswordHasher,
  SqliteAiCacheRepository,
  SqliteAiUsageRepository,
  SqliteAuditRepository,
  SqliteAutomationRepository,
  SqliteClassificationRepository,
  SqliteDatabase,
  SqliteDocumentRepository,
  SqliteLicenseRepository,
  SqliteOcrQueueRepository,
  SqliteSearchRepository,
  SqliteSecretStore,
  SqliteSessionRepository,
  SqliteSettingsRepository,
  SqliteShareRepository,
  SqliteSourceRepository,
  SqliteTagRepository,
  SqliteUserRepository,
  SqliteSyncLocalStore,
  SupabaseAuthClient,
  SupabaseSyncStore,
  type SupabaseSession,
  randomHex,
  runMigrations,
  type Logger,
} from '@documind/core'
import { isAllowedExtension } from '@documind/shared'
import { ChokidarFileWatcher } from './watcher'
import { BackupManager } from './backups'
import { UpdateManager } from './updates'
import { SessionManager } from './session'

export interface RuntimeOptions {
  userDataPath: string
  /** Secreto maestro para cifrar API keys (idealmente protegido por safeStorage). */
  masterSecret: string
  logger?: Logger
  fileWatcher?: FileWatcher
  ocrEngine?: OCREngine | null
}

export interface ScanResult {
  scanned: number
  indexed: number
  errors: string[]
}

export interface RuntimeRepositories {
  documents: SqliteDocumentRepository
  sources: SqliteSourceRepository
  tags: SqliteTagRepository
  classifications: SqliteClassificationRepository
  search: SqliteSearchRepository
  audit: SqliteAuditRepository
  settings: SqliteSettingsRepository
  aiCache: SqliteAiCacheRepository
  aiUsage: SqliteAiUsageRepository
  ocrQueue: SqliteOcrQueueRepository
  automation: SqliteAutomationRepository
  users: SqliteUserRepository
  sessions: SqliteSessionRepository
}

export interface AppRuntime {
  db: SqliteDatabase
  bus: EventBus
  logger: Logger
  userDataPath: string
  repos: RuntimeRepositories
  settingsService: SettingsService
  documentService: DocumentService
  searchService: SearchService
  tagService: TagService
  auditService: AuditService
  automationService: AutomationService
  classificationService: ClassificationService
  summarizeService: SummarizeService
  qaService: QaService
  auth: SessionManager
  license: LicenseService
  sync: SyncService
  shareService: ShareService
  /** Compartición multiusuario: resuelve el correo de la cuenta conectada. */
  shares: {
    list(): Promise<Share[]>
    invite(memberEmail: string, role: ShareRole): Promise<Share>
    accept(uid: string): Promise<Share>
    revoke(uid: string): Promise<Share>
    setRole(uid: string, role: ShareRole): Promise<Share>
    outgoing(): Promise<Share[]>
    incoming(): Promise<Share[]>
  }
  indexing: IndexingService
  ocrEngine: OCREngine | null
  watcher: FileWatcher
  backups: BackupManager
  updates: UpdateManager
  sources: DocumentSource[]
  getProvider(): Promise<AIProvider | null>
  saveApiKey(provider: string, apiKey: string): Promise<void>
  deleteApiKey(provider: string): Promise<void>
  hasApiKey(provider: string): Promise<boolean>
  refreshServices(): Promise<void>
  scanSource(sourceId: number): Promise<ScanResult>
  scanPath(path: string, filename: string, sourceId: number | null): Promise<boolean>
  rescanAll(): Promise<ScanResult>
  restoreBackup(name: string): Promise<void>
  /** Conecta la cuenta Supabase (email/contraseña) para la sincronización. */
  syncLogin(url: string, anonKey: string, email: string, password: string): Promise<SyncStatus>
  /** Crea una cuenta Supabase y, si no requiere confirmación, la conecta. */
  syncSignUp(
    url: string,
    anonKey: string,
    email: string,
    password: string,
  ): Promise<{ ok: boolean; confirmationRequired: boolean; status: SyncStatus | null }>
  /** Desconecta la cuenta Supabase (borra la sesión cifrada y el correo). */
  syncSignOut(): Promise<SyncStatus>
  dispose(): Promise<void>
}

const DB_FILE = 'documind.db'
const BACKUPS_DIR = 'backups'
const DEVICE_ID_FILE = 'device.id'
const DEFAULT_LICENSE_URL = 'https://licenses.example.invalid'
/** Auto-sync: primera ejecución y periodicidad en segundo plano. */
const AUTO_SYNC_INITIAL_MS = 5_000
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1_000

export function dbPathOf(userDataPath: string): string {
  return join(userDataPath, DB_FILE)
}

/** Identificador de instalación estable, persistido en userData. */
export function deviceIdOf(userDataPath: string): string {
  const idFile = join(userDataPath, DEVICE_ID_FILE)
  try {
    const existing = readFileSync(idFile, 'utf8').trim()
    if (existing) return existing
  } catch {
    // se genera a continuación
  }
  const id = randomHex(16)
  mkdirSync(userDataPath, { recursive: true })
  writeFileSync(idFile, id, { mode: 0o600 })
  return id
}

/** Genera o recupera el secreto maestro persistido (sin depender de Electron). */
export function masterSecretOf(userDataPath: string): string {
  const keyFile = join(userDataPath, 'master.key')
  try {
    return readFileSync(keyFile, 'utf8')
  } catch {
    const secret = randomHex(32)
    mkdirSync(userDataPath, { recursive: true })
    writeFileSync(keyFile, secret, { mode: 0o600 })
    return secret
  }
}

/**
 * Composition root del proceso principal. Monta la base de datos, los
 * repositorios, los servicios del dominio, la indexación, OCR e IA.
 * No depende de Electron para poder testearse de forma headless.
 */
export async function createRuntime(options: RuntimeOptions): Promise<AppRuntime> {
  const { userDataPath, masterSecret } = options
  mkdirSync(userDataPath, { recursive: true })

  const logger = options.logger ?? new ConsoleLogger('info')
  const db = new SqliteDatabase(dbPathOf(userDataPath))
  runMigrations(db)

  const bus = new InMemoryEventBus()
  const cipher = new AesGcm(masterSecret)

  const repositories = {
    documents: new SqliteDocumentRepository(db),
    sources: new SqliteSourceRepository(db),
    tags: new SqliteTagRepository(db),
    classifications: new SqliteClassificationRepository(db),
    search: new SqliteSearchRepository(db),
    audit: new SqliteAuditRepository(db),
    settings: new SqliteSettingsRepository(db),
    aiCache: new SqliteAiCacheRepository(db),
    aiUsage: new SqliteAiUsageRepository(db),
    ocrQueue: new SqliteOcrQueueRepository(db),
    automation: new SqliteAutomationRepository(db),
    users: new SqliteUserRepository(db),
    sessions: new SqliteSessionRepository(db),
  }
  const secretStore = new SqliteSecretStore(db, cipher)

  const settingsService = new SettingsService(repositories.settings)
  const documentService = new DocumentService(repositories.documents, bus)
  const searchService = new SearchService(repositories.search)
  const tagService = new TagService(repositories.tags, bus)
  const auditService = new AuditService(repositories.audit)
  const automationService = new AutomationService(repositories.automation, bus)

  const authService = new AuthService(
    repositories.users,
    repositories.sessions,
    new ScryptPasswordHasher(),
    new CryptoSessionTokens(),
  )
  const auth = new SessionManager(authService, secretStore)

  // Identificador de instalación estable (licencias y sincronización).
  const deviceId = deviceIdOf(userDataPath)

  const license = new LicenseService(
    new SqliteLicenseRepository(db),
    new CryptoLicenseVerifier(),
    new HttpLicenseServer({
      baseUrl: process.env.DOCUMIND_LICENSE_URL ?? DEFAULT_LICENSE_URL,
    }),
    deviceId,
  )

  // Sincronización: el store remoto se reconstruye con la configuración
  // vigente en cada operación (configure() persiste en el store local). Las
  // peticiones se autentican como usuario de Supabase Auth (JWT) para que
  // RLS restringa los datos por `user_id`; la sesión vive cifrada en el
  // SecretStore y se renueva automáticamente al caducar.
  const syncLocal = new SqliteSyncLocalStore(db, deviceId, async () => {
    try {
      return (await getSupabaseSession()).userId
    } catch {
      return null
    }
  })

  const getSupabaseSession = async (): Promise<SupabaseSession> => {
    const settings = await syncLocal.getSettings()
    if (!settings.url || !settings.anonKey) {
      throw new SyncError('Sincronización no configurada', 'ERR_SYNC_NOT_CONFIGURED')
    }
    if (!settings.email) {
      throw new SyncError('Cuenta Supabase no conectada', 'ERR_SYNC_AUTH')
    }
    const raw = await secretStore.get('sync')
    if (!raw) {
      throw new SyncError('Sesión de Supabase no disponible', 'ERR_SYNC_AUTH')
    }
    let session: SupabaseSession
    try {
      session = JSON.parse(raw) as SupabaseSession
    } catch {
      throw new SyncError('Sesión de Supabase corrupta', 'ERR_SYNC_AUTH')
    }
    if (session.expiresAt <= Date.now() + 60_000) {
      const client = new SupabaseAuthClient({ url: settings.url, anonKey: settings.anonKey })
      session = await client.refresh(session.refreshToken)
      await secretStore.set('sync', JSON.stringify(session))
    }
    return session
  }

  const remoteStore = async (): Promise<SupabaseSyncStore> => {
    const settings = await syncLocal.getSettings()
    const session = await getSupabaseSession()
    return new SupabaseSyncStore({
      url: settings.url,
      anonKey: settings.anonKey,
      deviceId,
      accessToken: session.accessToken,
      userId: session.userId,
    })
  }

  const syncRemote: SyncRemoteStore = {
    async push(changes: SyncChange[]): Promise<void> {
      await (await remoteStore()).push(changes)
    },
    async pull(sinceMs: number): Promise<SyncChange[]> {
      return (await remoteStore()).pull(sinceMs)
    },
    async ping(): Promise<void> {
      await (await remoteStore()).ping()
    },
  }
  const sync = new SyncService(syncLocal, syncRemote)

  // Compartición multiusuario: el propietario es la cuenta Supabase conectada
  // (settings.email). Sin cuenta no se puede compartir ni aceptar.
  const shareService = new ShareService(new SqliteShareRepository(db))
  const syncEmailOf = async (): Promise<string> => {
    const settings = await syncLocal.getSettings()
    if (!settings.email) {
      throw new SyncError(
        'Conecta una cuenta de sincronización para compartir tu biblioteca',
        'ERR_SYNC_AUTH',
      )
    }
    return settings.email
  }

  // Auto-sync en segundo plano: sincroniza periódicamente si está habilitada,
  // sin bloquear otras operaciones. No lanza: solo registra el resultado.
  let autoSyncRunning = false
  const runAutoSync = async (): Promise<void> => {
    if (autoSyncRunning) return
    autoSyncRunning = true
    try {
      const settings = await syncLocal.getSettings()
      if (!settings.enabled || !settings.url || !settings.anonKey) return
      const result = await sync.sync()
      bus.emit('sync:completed', result)
      logger.info('Auto-sync completado', { ...result })
    } catch (error) {
      logger.warn('Auto-sync falló', { error: String(error) })
    } finally {
      autoSyncRunning = false
    }
  }
  const autoSyncTimer = setTimeout(() => {
    void runAutoSync()
  }, AUTO_SYNC_INITIAL_MS)
  const autoSyncInterval = setInterval(() => {
    void runAutoSync()
  }, AUTO_SYNC_INTERVAL_MS)
  autoSyncInterval.unref?.()

  const ocrEngine =
    options.ocrEngine !== undefined
      ? options.ocrEngine
      : new TesseractOcrEngine({ defaultLanguages: ['spa', 'eng'], maxWorkers: 2 })

  const extraction = new ExtractionService()
  let settingsCache: AppSettings = await settingsService.get()

  const getProvider = async (): Promise<AIProvider | null> => {
    const settings = await settingsService.get()
    if (!settings.ai.provider) return null
    const apiKey = await secretStore.get(settings.ai.provider)
    if (!apiKey && settings.ai.provider !== 'ollama') return null
    return createAIProvider(settings.ai.provider, apiKey ?? '')
  }

  let classificationService!: ClassificationService
  let summarizeService!: SummarizeService
  let qaService!: QaService
  let indexing!: IndexingService
  const buildIndexing = async (): Promise<void> => {
    const ai = await getProvider()
    classificationService = new ClassificationService({
      ai,
      documents: repositories.documents,
      classifications: repositories.classifications,
      cache: repositories.aiCache,
      usage: repositories.aiUsage,
      bus,
      settings: () => settingsCache,
    })
    summarizeService = new SummarizeService({
      ai,
      documents: repositories.documents,
      cache: repositories.aiCache,
      usage: repositories.aiUsage,
      bus,
      settings: () => settingsCache,
    })
    qaService = new QaService({
      ai,
      documents: repositories.documents,
      search: repositories.search,
      cache: repositories.aiCache,
      usage: repositories.aiUsage,
      bus,
      settings: () => settingsCache,
    })
    indexing = new IndexingService({
      extraction,
      documents: repositories.documents,
      ocrQueue: repositories.ocrQueue,
      classifier: classificationService,
      ocrEngine,
      bus,
      settings: () => settingsCache,
    })
  }

  // Watcher de carpetas: se re-arma al cambiar fuentes o configuración.
  const watcher = options.fileWatcher ?? new ChokidarFileWatcher()
  let watchedSources = new Map<number, string>()

  const scanPath = async (path: string, filename: string, sourceId: number | null): Promise<boolean> => {
    if (!isAllowedExtension(filename)) return false
    let info
    try {
      info = await stat(path)
    } catch {
      return false
    }
    if (!info.isFile()) return false
    const buffer = await readFile(path)
    await indexing.indexFile({ sourceId, path, filename, buffer, mtimeMs: info.mtimeMs })
    return true
  }

  const syncSources = async (): Promise<void> => {
    const list = await repositories.sources.list()
    watchedSources.clear()
    for (const source of list) {
      if (!source.enabled) continue
      try {
        await watcher.watch(source.path, source.scanMode === 'recursive')
        watchedSources.set(source.id, source.path)
      } catch (error) {
        logger.warn(`No se pudo observar ${source.path}`, { error: String(error) })
      }
    }
  }

  watcher.onChange((change) => {
    if (!isAllowedExtension(change.path)) return
    const sourceId = [...watchedSources.entries()].find(([, root]) =>
      change.path.startsWith(root),
    )?.[0]
    void (async () => {
      try {
        if (change.kind === 'unlink') {
          const existing = await repositories.documents.findByPath(sourceId ?? null, change.path)
          if (existing) {
            await documentService.remove(existing.id)
            logger.info('Documento eliminado por watcher', { id: existing.id, path: change.path })
          }
          return
        }
        const filename = change.path.split(/[\\/]/).pop() ?? ''
        await scanPath(change.path, filename, sourceId ?? null)
      } catch (error) {
        logger.error('Error procesando cambio de watcher', { path: change.path }, error as Error)
      }
    })()
  })

  // Automatizaciones: reglas que reaccionan a eventos del dominio.
  const automationActions: AutomationActions = {
    async tag(documentId, tagNames) {
      const tags = await tagService.ensureSuggested(tagNames)
      for (const tag of tags) await repositories.tags.assign(tag.id, documentId)
    },
    async classify(documentId) {
      await classificationService.classify(documentId)
    },
  }
  const runningAutomations = new Set<number>()
  const runAutomations = (
    trigger: 'document:indexed' | 'document:classified',
    documentId: number,
  ): void => {
    if (runningAutomations.has(documentId)) return
    runningAutomations.add(documentId)
    void automationService.runForTrigger(trigger, documentId, automationActions).finally(() => {
      runningAutomations.delete(documentId)
    })
  }
  bus.on('document:indexed', ({ documentId }) => runAutomations('document:indexed', documentId))
  bus.on('document:classified', ({ documentId }) =>
    runAutomations('document:classified', documentId),
  )
  bus.on('automation:run', ({ automationId, documentId, ok }) => {
    void auditService.record({
      action: ok ? 'automation.run' : 'automation.failed',
      entityType: 'automation',
      entityId: String(automationId),
      detail: ok ? `Documento #${documentId}` : `Falló en documento #${documentId}`,
    })
  })

  const backups = new BackupManager(join(userDataPath, BACKUPS_DIR), logger)
  const updates = new UpdateManager(settingsService)
  updates.startAutoCheck()

  const runtime: AppRuntime = {
    db,
    bus,
    logger,
    userDataPath,
    repos: repositories,
    settingsService,
    documentService,
    searchService,
    tagService,
    auditService,
    automationService,
    auth,
    license,
    sync,
    get shareService(): ShareService {
      return shareService
    },
    shares: {
      list: async () => shareService.list(),
      invite: async (memberEmail, role) => shareService.invite(await syncEmailOf(), memberEmail, role),
      accept: async (uid) => shareService.accept(await syncEmailOf(), uid),
      revoke: async (uid) => shareService.revoke(await syncEmailOf(), uid),
      setRole: async (uid, role) => shareService.setRole(await syncEmailOf(), uid, role),
      outgoing: async () => shareService.outgoing(await syncEmailOf()),
      incoming: async () => shareService.incoming(await syncEmailOf()),
    },
    get classificationService(): ClassificationService {
      return classificationService
    },
    get summarizeService(): SummarizeService {
      return summarizeService
    },
    get qaService(): QaService {
      return qaService
    },
    get indexing(): IndexingService {
      return indexing
    },
    ocrEngine,
    watcher,
    backups,
    updates,
    sources: await repositories.sources.list(),
    getProvider,
    async saveApiKey(provider, apiKey): Promise<void> {
      await secretStore.set(provider as never, apiKey)
      await buildIndexing()
    },
    async deleteApiKey(provider): Promise<void> {
      await secretStore.delete(provider as never)
      await buildIndexing()
    },
    async hasApiKey(provider): Promise<boolean> {
      return secretStore.has(provider as never)
    },
    async refreshServices(): Promise<void> {
      settingsCache = await settingsService.get()
      await buildIndexing()
      await syncSources()
      runtime.sources = await repositories.sources.list()
    },
    async scanSource(sourceId): Promise<ScanResult> {
      const found = (await repositories.sources.list()).find((s) => s.id === sourceId)
      if (!found) return { scanned: 0, indexed: 0, errors: ['Fuente no encontrada'] }
      const scan: ScanResult = { scanned: 0, indexed: 0, errors: [] }
      const processFile = async (full: string, name: string, sid: number | null): Promise<void> => {
        scan.scanned++
        try {
          const info = await stat(full)
          const buffer = await readFile(full)
          await indexing.indexFile({
            sourceId: sid,
            path: full,
            filename: name,
            buffer,
            mtimeMs: info.mtimeMs,
          })
          scan.indexed++
        } catch (error) {
          scan.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const visit = async (dir: string, sid: number | null): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            if (found.scanMode === 'recursive') await visit(full, sid)
            continue
          }
          if (!entry.isFile() || !isAllowedExtension(entry.name)) continue
          await processFile(full, entry.name, sid)
        }
      }
      if (found.kind === 'file') {
        await processFile(found.path, found.path.split(/[\\/]/).pop() ?? found.path, found.id)
      } else {
        await visit(found.path, found.id)
      }
      await repositories.sources.setLastScan(found.id, new Date().toISOString())
      logger.info('Escaneo completado', { sourceId, scanned: scan.scanned, indexed: scan.indexed })
      return scan
    },
    async scanPath(path, filename, sourceId): Promise<boolean> {
      return scanPath(path, filename, sourceId)
    },
    async rescanAll(): Promise<ScanResult> {
      const combined: ScanResult = { scanned: 0, indexed: 0, errors: [] }
      for (const source of await repositories.sources.list()) {
        if (!source.enabled) continue
        const result = await runtime.scanSource(source.id)
        combined.scanned += result.scanned
        combined.indexed += result.indexed
        combined.errors.push(...result.errors)
      }
      return combined
    },
    async restoreBackup(name): Promise<void> {
      await runtime.dispose()
      await backups.restore(name, dbPathOf(userDataPath))
    },
    async syncLogin(url, anonKey, email, password): Promise<SyncStatus> {
      const cleanUrl = url.trim().replace(/\/+$/, '')
      const client = new SupabaseAuthClient({ url: cleanUrl, anonKey: anonKey.trim() })
      const session = await client.login(email.trim(), password)
      await secretStore.set('sync', JSON.stringify(session))
      return sync.configure(cleanUrl, anonKey.trim(), email.trim())
    },
    async syncSignUp(url, anonKey, email, password) {
      const cleanUrl = url.trim().replace(/\/+$/, '')
      const client = new SupabaseAuthClient({ url: cleanUrl, anonKey: anonKey.trim() })
      const result = await client.signUp(email.trim(), password)
      if (!result.confirmationRequired && result.session) {
        await secretStore.set('sync', JSON.stringify(result.session))
        const status = await sync.configure(cleanUrl, anonKey.trim(), email.trim())
        return { ok: true, confirmationRequired: false, status }
      }
      return { ok: true, confirmationRequired: true, status: null }
    },
    async syncSignOut(): Promise<SyncStatus> {
      await secretStore.delete('sync')
      const settings = await syncLocal.getSettings()
      return sync.configure(settings.url, settings.anonKey, '')
    },
    async dispose(): Promise<void> {
      clearTimeout(autoSyncTimer)
      clearInterval(autoSyncInterval)
      updates.dispose()
      watcher.close()
      await ocrEngine?.dispose?.()
      db.checkpoint()
      db.close()
    },
  }

  await runtime.refreshServices()
  await auth.restore()
  return runtime
}
