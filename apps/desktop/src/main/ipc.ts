import { ipcMain, dialog, BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import { basename } from 'node:path'
import type { EventBus, PublicUser, Role, SettingsPatch } from '@documind/domain'
import {
  AuthError,
  SyncError,
  documentFilterSchema,
  loginSchema,
  newAutomationSchema,
  newShareSchema,
  newSourceSchema,
  newTagSchema,
  providerIdSchema,
  registerUserSchema,
  roleSchema,
  shareRoleSchema,
} from '@documind/domain'
import { IpcChannel, IpcEvent, APP_NAME, APP_VERSION } from '@documind/shared'
import type { AppRuntime } from './runtime'
import { dbPathOf } from './runtime'

export interface IpcContext {
  getRuntime(): AppRuntime
  /** Reconstruye el runtime (tras restaurar un backup) y devuelve la nueva instancia. */
  rebuildRuntime(): Promise<AppRuntime>
}

/** Convierte un error en un AppError serializable para IPC. */
function codeOf(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code)
  }
  return 'ERR_UNKNOWN'
}

/** Mensaje legible: para ZodError usa el primer issue (texto amigable, no el JSON crudo). */
function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && Array.isArray((error as { issues?: unknown[] }).issues)) {
    const first = (error as { issues: { message?: string }[] }).issues[0]
    if (first?.message) return first.message
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Registra todos los canales IPC del allowlist. Cada handler valida su
 * entrada (zod), ejecuta el caso de uso y devuelve un Result tipado.
 */
export function registerIpc(context: IpcContext): void {
  const handle = <Args extends unknown[], R>(channel: string, fn: (...args: Args) => Promise<R>): void => {
    ipcMain.handle(channel, async (_event, ...args: Args) => {
      try {
        return { ok: true as const, data: await fn(...args) }
      } catch (error) {
        return { ok: false as const, error: { code: codeOf(error), message: messageOf(error) } }
      }
    })
  }

  const rt = (): AppRuntime => context.getRuntime()

  // Jerarquía de roles: viewer solo lectura, editor opera documentos,
  // admin gestiona configuración y usuarios. La comprobación vive aquí y en
  // el dominio; ocultar botones en la UI no es suficiente.
  const ROLE_WEIGHT: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 }
  const requireRole = (min: Role): PublicUser => {
    const user = rt().auth.current()
    if (!user) throw new AuthError('Sesión no iniciada', 'ERR_AUTH')
    if (ROLE_WEIGHT[user.role] < ROLE_WEIGHT[min]) {
      throw new AuthError('Permisos insuficientes para esta operación', 'ERR_FORBIDDEN')
    }
    return user
  }

  // System
  handle(IpcChannel.SystemInfo, async () => ({
    name: APP_NAME,
    version: APP_VERSION,
    platform: process.platform,
    arch: process.arch,
  }))
  handle(IpcChannel.SystemPing, async () => ({ pong: true }))

  // Importar archivos/carpetas soltadas (drag & drop)
  handle(IpcChannel.SystemImportPaths, async (paths: string[]) => {
    requireRole('editor')
    const unique = [...new Set(paths.filter((p) => p && p.trim().length > 0))]
    if (unique.length === 0) return { scanned: 0, indexed: 0, errors: [] }

    const errors: string[] = []
    let scanned = 0
    let indexed = 0

    for (const path of unique) {
      try {
        const info = statSync(path)
        if (info.isDirectory()) {
          const existing = (await rt().repos.sources.list()).find((s) => s.path === path)
          const source =
            existing ??
            (await rt().repos.sources.add({
              path,
              name: basename(path),
              kind: 'folder',
              scanMode: 'recursive',
              enabled: true,
            }))
          const result = await rt().scanSource(source.id)
          scanned += result.scanned
          indexed += result.indexed
        } else if (info.isFile()) {
          const filename = basename(path)
          const ok = await rt().scanPath(path, filename, null)
          if (ok) {
            scanned += 1
            indexed += 1
          }
        }
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return { scanned, indexed, errors }
  })

  // Dialog (selector nativo de carpeta/archivo para añadir fuentes)
  const dialogHandle = (
    channel: string,
    options: { title: string; properties: Array<'openDirectory' | 'openFile' | 'createDirectory'> },
  ): void => {
    ipcMain.handle(channel, async (event) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const dialogOptions = {
          title: options.title,
          properties: options.properties,
          buttonLabel: 'Seleccionar',
        }
        const result = win
          ? await dialog.showOpenDialog(win, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions)
        return {
          ok: true as const,
          data: result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0],
        }
      } catch (error) {
        return { ok: false as const, error: { code: codeOf(error), message: messageOf(error) } }
      }
    })
  }
  dialogHandle(IpcChannel.DialogSelectFolder, {
    title: 'Seleccionar carpeta',
    properties: ['openDirectory', 'createDirectory'],
  })
  dialogHandle(IpcChannel.DialogSelectFile, {
    title: 'Seleccionar archivo',
    properties: ['openFile'],
  })

  // Documents
  handle(IpcChannel.DocumentsList, async (filter) =>
    rt().documentService.list(documentFilterSchema.parse(filter ?? {})),
  )
  handle(IpcChannel.DocumentsGet, async (id: number) => {
    const document = await rt().repos.documents.findById(id)
    if (!document) return null
    const content = await rt().repos.documents.getContent(id)
    const tags = await rt().repos.tags.listByDocument(id)
    const classification = await rt().repos.classifications.findByDocumentId(id)
    return { document, content, tags, classification }
  })
  handle(IpcChannel.DocumentsDelete, async (id: number) => {
    requireRole('editor')
    await rt().documentService.remove(id)
    await rt().auditService.record({
      action: 'document.deleted',
      entityType: 'document',
      entityId: String(id),
    })
    return { id }
  })
  handle(IpcChannel.DocumentsStats, async () => rt().documentService.stats())
  handle(IpcChannel.DocumentsHistory, async (id: number) => rt().repos.documents.listHistory(id, 50))

  // Sources
  handle(IpcChannel.SourcesList, async () => rt().repos.sources.list())
  handle(IpcChannel.SourcesAdd, async (input) => {
    requireRole('editor')
    const source = await rt().repos.sources.add(newSourceSchema.parse(input))
    await rt().refreshServices()
    return source
  })
  handle(IpcChannel.SourcesRemove, async (id: number) => {
    requireRole('editor')
    await rt().repos.sources.remove(id)
    await rt().refreshServices()
    return { id }
  })
  handle(IpcChannel.SourcesRescan, async (id: number) => {
    requireRole('editor')
    return rt().scanSource(id)
  })

  // Search
  handle(IpcChannel.SearchQuery, async (payload) => {
    const { query, limit, filter } = payload as {
      query: string
      limit?: number
      filter?: { ext?: string; tagId?: number }
    }
    return rt().searchService.fullText(query, limit ?? 50, filter)
  })

  // Tags
  handle(IpcChannel.TagsList, async () => rt().tagService.listWithStats())
  handle(IpcChannel.TagsCreate, async (input) => {
    requireRole('editor')
    const tag = await rt().tagService.create(newTagSchema.parse(input))
    await rt().auditService.record({
      action: 'tag.create',
      entityType: 'tag',
      entityId: String(tag.id),
      detail: tag.name,
    })
    return tag
  })
  handle(IpcChannel.TagsAssign, async (payload: { tagId: number; documentId: number }) => {
    requireRole('editor')
    await rt().tagService.assign(payload.tagId, payload.documentId)
    await rt().auditService.record({
      action: 'tag.assign',
      entityType: 'document',
      entityId: String(payload.documentId),
      detail: `Etiqueta #${payload.tagId}`,
    })
    return { ok: true }
  })
  handle(IpcChannel.TagsRemove, async (payload: { tagId: number; documentId: number }) => {
    requireRole('editor')
    await rt().tagService.unassign(payload.tagId, payload.documentId)
    await rt().auditService.record({
      action: 'tag.unassign',
      entityType: 'document',
      entityId: String(payload.documentId),
      detail: `Etiqueta #${payload.tagId}`,
    })
    return { ok: true }
  })
  handle(IpcChannel.TagsDelete, async (id: number) => {
    requireRole('editor')
    await rt().tagService.delete(id)
    await rt().auditService.record({
      action: 'tag.delete',
      entityType: 'tag',
      entityId: String(id),
    })
    return { id }
  })

  // AI
  handle(IpcChannel.AiClassify, async (documentId: number) => {
    requireRole('editor')
    const classification = await rt().classificationService.classify(documentId)
    if (classification) {
      await rt().auditService.record({
        action: 'document.classified',
        entityType: 'document',
        entityId: String(documentId),
        detail: `${classification.provider}/${classification.model} · ${classification.category}`,
      })
    }
    return classification
  })
  handle(IpcChannel.AiUsage, async () => rt().repos.aiUsage.summarize())
  handle(IpcChannel.AiSummarize, async (documentId: number) => {
    requireRole('editor')
    const result = await rt().summarizeService.summarize(Number(documentId))
    if (result) {
      await rt().auditService.record({
        action: 'document.summarized',
        entityType: 'document',
        entityId: String(documentId),
        detail: `${result.provider}/${result.model}${result.cached ? ' · caché' : ''}`,
      })
    }
    return result
  })
  handle(IpcChannel.AiQa, async (question: string) => {
    requireRole('editor')
    const result = await rt().qaService.ask(String(question ?? ''), 5)
    if (result.citations.length > 0) {
      await rt().auditService.record({
        action: 'ai.qa',
        entityType: 'ai',
        detail: `«${String(question ?? '').slice(0, 80)}» · ${result.citations.length} docs`,
      })
    }
    return result
  })
  handle(IpcChannel.AiHealth, async () => {
    const provider = await rt().getProvider()
    if (!provider) return { ok: false, latencyMs: 0, error: 'IA no configurada' }
    return provider.health()
  })
  handle(IpcChannel.AiSetApiKey, async (payload: { provider: string; apiKey: string }) => {
    requireRole('admin')
    const provider = providerIdSchema.parse(payload.provider)
    if (payload.apiKey.trim().length < 8) {
      throw new Error('La clave API es demasiado corta')
    }
    await rt().saveApiKey(provider, payload.apiKey.trim())
    return { provider }
  })
  handle(IpcChannel.AiDeleteApiKey, async (payload: { provider: string }) => {
    requireRole('admin')
    const provider = providerIdSchema.parse(payload.provider)
    await rt().deleteApiKey(provider)
    return { provider }
  })
  handle(IpcChannel.AiApiKeyStatus, async (payload: { provider: string }) => {
    const provider = providerIdSchema.parse(payload.provider)
    return { provider, set: await rt().hasApiKey(provider) }
  })
  handle(IpcChannel.AiResolveModel, async (payload: { provider?: unknown; force?: unknown }) => {
    const provider = providerIdSchema.parse(String(payload?.provider ?? ''))
    return rt().resolveModel(provider, Boolean(payload?.force))
  })

  // OCR
  handle(IpcChannel.OcrHealth, async () => {
    const engine = rt().ocrEngine
    if (!engine) return { ok: false, engine: 'none', error: 'OCR no disponible' }
    return engine.health()
  })
  handle(IpcChannel.OcrLanguagesList, async () => {
    const settings = await rt().settingsService.get()
    return rt().ocrLanguages.list(settings.ocrLanguages)
  })
  handle(IpcChannel.OcrLanguageInstall, async (payload: { code?: unknown }) => {
    requireRole('admin')
    const code = String(payload?.code ?? '').trim()
    if (!rt().ocrLanguages.language(code)) {
      throw new Error('Idioma no soportado')
    }
    await rt().ocrLanguages.install(code, (progress) => rt().bus.emit('ocr:language:progress', progress))
    return { code, ok: true }
  })
  handle(IpcChannel.OcrLanguageRemove, async (payload: { code?: unknown }) => {
    requireRole('admin')
    const code = String(payload?.code ?? '').trim()
    await rt().ocrLanguages.remove(code)
    return { code, ok: true }
  })
  handle(IpcChannel.OcrLanguageCheckUpdates, async () => rt().ocrLanguages.checkForUpdates())

  // Settings
  handle(IpcChannel.SettingsGet, async () => rt().settingsService.get())
  handle(IpcChannel.SettingsSet, async (patch) => {
    requireRole('admin')
    // updateSettings valida el objeto fusionado y reinicia el modelo si cambia
    // el proveedor; un parche parcial no pisa `ai.model` (resolución automática).
    return rt().updateSettings(patch as SettingsPatch)
  })

  // Backups
  handle(IpcChannel.BackupsCreate, async () => {
    requireRole('admin')
    rt().db.checkpoint()
    const backup = await rt().backups.create(dbPathOf(rt().userDataPath))
    await rt().auditService.record({
      action: 'backup.create',
      entityType: 'backup',
      entityId: backup.name,
    })
    return backup
  })
  handle(IpcChannel.BackupsList, async () => rt().backups.list())
  handle(IpcChannel.BackupsRestore, async (name: string) => {
    requireRole('admin')
    await rt().restoreBackup(name)
    await rt().auditService.record({
      action: 'backup.restore',
      entityType: 'backup',
      entityId: name,
    })
    await context.rebuildRuntime()
    return { ok: true }
  })

  // Updates
  handle(IpcChannel.UpdatesCheck, async () => rt().updates.check())
  handle(IpcChannel.UpdatesDownload, async () => rt().updates.download())
  handle(IpcChannel.UpdatesInstall, async () => {
    await rt().updates.install()
    return { ok: true }
  })
  handle(IpcChannel.UpdatesState, async () => rt().updates.getState())

  // Automations
  handle(IpcChannel.AutomationsList, async () => rt().automationService.list())
  handle(IpcChannel.AutomationsCreate, async (input) => {
    requireRole('editor')
    const automation = await rt().automationService.create(newAutomationSchema.parse(input))
    await rt().auditService.record({
      action: 'automation.create',
      entityType: 'automation',
      entityId: String(automation.id),
      detail: automation.name,
    })
    return automation
  })
  handle(IpcChannel.AutomationsSetEnabled, async (payload: { id: number; enabled: boolean }) => {
    requireRole('editor')
    await rt().automationService.setEnabled(payload.id, payload.enabled)
    await rt().auditService.record({
      action: payload.enabled ? 'automation.enable' : 'automation.disable',
      entityType: 'automation',
      entityId: String(payload.id),
    })
    return { id: payload.id, enabled: payload.enabled }
  })
  handle(IpcChannel.AutomationsRemove, async (id: number) => {
    requireRole('editor')
    await rt().automationService.remove(id)
    await rt().auditService.record({
      action: 'automation.remove',
      entityType: 'automation',
      entityId: String(id),
    })
    return { id }
  })

  // Audit (historial)
  handle(IpcChannel.AuditList, async (payload: { limit?: number; cursor?: number } = {}) =>
    rt().auditService.list(payload.limit ?? 100, payload.cursor),
  )

  // Auth (usuarios y sesión). El token nunca cruza el IPC: el renderer solo
  // recibe usuarios públicos y el proceso principal conserva la sesión.
  handle(IpcChannel.AuthStatus, async () => rt().auth.status())
  handle(IpcChannel.AuthSetup, async (input) => {
    const user = await rt().auth.setupAdmin(registerUserSchema.parse(input))
    await rt().auditService.record({
      action: 'auth.setup',
      entityType: 'user',
      entityId: String(user.id),
      detail: user.username,
    })
    return user
  })
  handle(IpcChannel.AuthRegister, async (input) => {
    const user = await rt().auth.register(registerUserSchema.parse(input))
    await rt().auditService.record({
      action: 'auth.create',
      entityType: 'user',
      entityId: String(user.id),
      detail: user.username,
    })
    return user
  })
  handle(IpcChannel.AuthLogin, async (payload) => {
    const { username, password } = loginSchema.parse(payload)
    const user = await rt().auth.login(username, password)
    await rt().auditService.record({
      action: 'auth.login',
      entityType: 'user',
      entityId: String(user.id),
      detail: user.username,
    })
    return user
  })
  handle(IpcChannel.AuthLogout, async () => {
    await rt().auth.logout()
    await rt().auditService.record({ action: 'auth.logout' })
    return { ok: true }
  })
  handle(IpcChannel.AuthListUsers, async () => rt().auth.listUsers())
  handle(IpcChannel.AuthSetRole, async (payload: { userId: number; role: unknown }) => {
    const role = roleSchema.parse(payload.role)
    const updated = await rt().auth.setRole(payload.userId, role)
    await rt().auditService.record({
      action: 'auth.setRole',
      entityType: 'user',
      entityId: String(updated.id),
      detail: `${updated.username} → ${updated.role}`,
    })
    return updated
  })
  handle(IpcChannel.AuthChangePassword, async (payload: { currentPassword: string; newPassword: string }) => {
    await rt().auth.changePassword(payload.currentPassword, payload.newPassword)
    return { ok: true }
  })
  handle(IpcChannel.AuthDeleteUser, async (userId: number) => {
    await rt().auth.deleteUser(userId)
    await rt().auditService.record({
      action: 'auth.delete',
      entityType: 'user',
      entityId: String(userId),
    })
    return { ok: true }
  })

  // License (activación/verificación online). La verificación de la firma es
  // local; solo la activación/desactivación requieren red y rol admin.
  handle(IpcChannel.LicenseStatus, async () => {
    requireRole('viewer')
    return rt().license.status()
  })
  handle(IpcChannel.LicenseActivate, async (key: unknown) => {
    requireRole('admin')
    const license = await rt().license.activate(String(key ?? '').trim())
    await rt().auditService.record({
      action: 'license.activate',
      entityType: 'license',
      detail: `${license.tier}${license.expiresAt ? ` · hasta ${license.expiresAt}` : ' · perpetua'}`,
    })
    return license
  })
  handle(IpcChannel.LicenseDeactivate, async () => {
    requireRole('admin')
    await rt().license.deactivate()
    await rt().auditService.record({ action: 'license.deactivate', entityType: 'license' })
    return { ok: true }
  })

  // Sync (sincronización con Supabase/Postgres). Configurar el servidor y
  // activar la sincronización requiere rol admin; ejecutar el ciclo de sync
  // lo puede lanzar cualquier editor (afecta solo a sus propios documentos).
  handle(IpcChannel.SyncStatus, async () => {
    requireRole('viewer')
    return rt().sync.status()
  })
  handle(IpcChannel.SyncSetEnabled, async (enabled: unknown) => {
    requireRole('admin')
    const status = await rt().sync.setEnabled(Boolean(enabled))
    await rt().auditService.record({
      action: 'sync.setEnabled',
      detail: status.enabled ? 'habilitada' : 'deshabilitada',
    })
    return status
  })
  handle(
    IpcChannel.SyncConfigure,
    async (payload: { url?: unknown; anonKey?: unknown; email?: unknown; password?: unknown }) => {
      requireRole('admin')
      const url = String(payload?.url ?? '').trim()
      const anonKey = String(payload?.anonKey ?? '').trim()
      const email = String(payload?.email ?? '').trim()
      const password = String(payload?.password ?? '')
      if (!url) throw new SyncError('URL del proyecto Supabase requerida', 'ERR_SYNC_NOT_CONFIGURED')
      if (!anonKey) throw new SyncError('Clave anon del proyecto requerida', 'ERR_SYNC_NOT_CONFIGURED')
      if (!email || !password) {
        throw new SyncError('Correo y contraseña de la cuenta Supabase requeridos', 'ERR_SYNC_AUTH')
      }
      const status = await rt().syncLogin(url, anonKey, email, password)
      await rt().auditService.record({
        action: 'sync.configure',
        detail: `${status.url} · ${status.email}`,
      })
      return status
    },
  )
  handle(
    IpcChannel.SyncSignUp,
    async (payload: { url?: unknown; anonKey?: unknown; email?: unknown; password?: unknown }) => {
      requireRole('admin')
      const url = String(payload?.url ?? '').trim()
      const anonKey = String(payload?.anonKey ?? '').trim()
      const email = String(payload?.email ?? '').trim()
      const password = String(payload?.password ?? '')
      if (!url || !anonKey) {
        throw new SyncError('URL y clave anon del proyecto requeridas', 'ERR_SYNC_NOT_CONFIGURED')
      }
      if (!email || password.length < 8) {
        throw new SyncError(
          'El correo y una contraseña de al menos 8 caracteres son requeridos',
          'ERR_SYNC_AUTH',
        )
      }
      const result = await rt().syncSignUp(url, anonKey, email, password)
      await rt().auditService.record({
        action: result.confirmationRequired ? 'sync.signupPending' : 'sync.signup',
        detail: email,
      })
      return result
    },
  )
  handle(IpcChannel.SyncSignOut, async () => {
    requireRole('admin')
    const status = await rt().syncSignOut()
    await rt().auditService.record({ action: 'sync.signout', detail: status.url })
    return status
  })
  handle(IpcChannel.SyncRun, async () => {
    requireRole('editor')
    const result = await rt().sync.sync()
    await rt().auditService.record({
      action: 'sync.run',
      detail: `subidos ${result.pushed} · recibidos ${result.pulled} · aplicados ${result.applied}`,
    })
    return result
  })
  handle(IpcChannel.SyncPing, async () => {
    requireRole('viewer')
    await rt().sync.ping()
    return { ok: true }
  })

  // Shares (compartición multiusuario). Invitar/revocar/cambiar rol requiere
  // rol admin; aceptar una invitación entrante lo puede hacer cualquier
  // usuario autenticado; consultar las listas es solo lectura.
  handle(IpcChannel.SharesList, async () => {
    requireRole('viewer')
    return rt().shares.list()
  })
  handle(IpcChannel.SharesOutgoing, async () => {
    requireRole('viewer')
    return rt().shares.outgoing()
  })
  handle(IpcChannel.SharesIncoming, async () => {
    requireRole('viewer')
    return rt().shares.incoming()
  })
  handle(IpcChannel.SharesInvite, async (input) => {
    requireRole('admin')
    const { memberEmail, role } = newShareSchema.parse(input)
    const share = await rt().shares.invite(memberEmail, role)
    await rt().auditService.record({
      action: 'share.invite',
      entityType: 'share',
      entityId: share.uid,
      detail: `${share.memberEmail} · ${share.role}`,
    })
    rt().bus.emit('shares:changed', { count: (await rt().shares.list()).length })
    return share
  })
  handle(IpcChannel.SharesAccept, async (uid: unknown) => {
    requireRole('editor')
    const share = await rt().shares.accept(String(uid ?? '').trim())
    await rt().auditService.record({
      action: 'share.accept',
      entityType: 'share',
      entityId: share.uid,
      detail: `${share.ownerEmail} → ${share.role}`,
    })
    rt().bus.emit('shares:changed', { count: (await rt().shares.list()).length })
    return share
  })
  handle(IpcChannel.SharesRevoke, async (uid: unknown) => {
    requireRole('admin')
    const share = await rt().shares.revoke(String(uid ?? '').trim())
    await rt().auditService.record({
      action: 'share.revoke',
      entityType: 'share',
      entityId: share.uid,
      detail: share.memberEmail,
    })
    rt().bus.emit('shares:changed', { count: (await rt().shares.list()).length })
    return share
  })
  handle(IpcChannel.SharesSetRole, async (payload: { uid?: unknown; role?: unknown }) => {
    requireRole('admin')
    const role = shareRoleSchema.parse(payload?.role)
    const share = await rt().shares.setRole(String(payload?.uid ?? '').trim(), role)
    await rt().auditService.record({
      action: 'share.setRole',
      entityType: 'share',
      entityId: share.uid,
      detail: `${share.memberEmail} → ${share.role}`,
    })
    rt().bus.emit('shares:changed', { count: (await rt().shares.list()).length })
    return share
  })
}

/** Reenvía los eventos del dominio al renderer por los canales IpcEvent. */
export function wireEvents(bus: EventBus, getWindow: () => BrowserWindow | null): () => void {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
  const subs = [
    bus.on('document:added', (p) => send(IpcEvent.EventDocumentIndexed, p)),
    bus.on('document:indexed', (p) => send(IpcEvent.EventDocumentIndexed, p)),
    bus.on('document:status', (p) => send(IpcEvent.EventDocumentStatus, p)),
    bus.on('index:progress', (p) => send(IpcEvent.EventIndexProgress, p)),
    bus.on('ocr:progress', (p) => send(IpcEvent.EventOcrProgress, p)),
    bus.on('ocr:language:progress', (p) => send(IpcEvent.EventOcrLanguageProgress, p)),
    bus.on('ai:progress', (p) => send(IpcEvent.EventAiProgress, p)),
    bus.on('notification', (p) => send(IpcEvent.EventNotification, p)),
    bus.on('automation:run', (p) => send(IpcEvent.EventAutomationRun, p)),
    bus.on('sync:completed', (p) => send(IpcEvent.EventSyncStatus, p)),
    bus.on('shares:changed', (p) => send(IpcEvent.EventSharesChanged, p)),
  ]
  return () => subs.forEach((unsub) => unsub())
}
