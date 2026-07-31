import { ipcMain, dialog, BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import { basename } from 'node:path'
import type { EventBus } from '@documind/domain'
import {
  appSettingsSchema,
  documentFilterSchema,
  newAutomationSchema,
  newSourceSchema,
  newTagSchema,
  providerIdSchema,
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Registra todos los canales IPC del allowlist. Cada handler valida su
 * entrada (zod), ejecuta el caso de uso y devuelve un Result tipado.
 */
export function registerIpc(context: IpcContext): void {
  const handle = <Args extends unknown[], R>(
    channel: string,
    fn: (...args: Args) => Promise<R>,
  ): void => {
    ipcMain.handle(channel, async (_event, ...args: Args) => {
      try {
        return { ok: true as const, data: await fn(...args) }
      } catch (error) {
        return { ok: false as const, error: { code: codeOf(error), message: messageOf(error) } }
      }
    })
  }

  const rt = (): AppRuntime => context.getRuntime()

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
    await rt().documentService.remove(id)
    await rt().auditService.record({
      action: 'document.deleted',
      entityType: 'document',
      entityId: String(id),
    })
    return { id }
  })
  handle(IpcChannel.DocumentsStats, async () => rt().documentService.stats())
  handle(IpcChannel.DocumentsHistory, async (id: number) =>
    rt().repos.documents.listHistory(id, 50),
  )

  // Sources
  handle(IpcChannel.SourcesList, async () => rt().repos.sources.list())
  handle(IpcChannel.SourcesAdd, async (input) => {
    const source = await rt().repos.sources.add(newSourceSchema.parse(input))
    await rt().refreshServices()
    return source
  })
  handle(IpcChannel.SourcesRemove, async (id: number) => {
    await rt().repos.sources.remove(id)
    await rt().refreshServices()
    return { id }
  })
  handle(IpcChannel.SourcesRescan, async (id: number) => rt().scanSource(id))

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
  handle(IpcChannel.AiHealth, async () => {
    const provider = await rt().getProvider()
    if (!provider) return { ok: false, latencyMs: 0, error: 'IA no configurada' }
    return provider.health()
  })
  handle(IpcChannel.AiSetApiKey, async (payload: { provider: string; apiKey: string }) => {
    const provider = providerIdSchema.parse(payload.provider)
    if (payload.apiKey.trim().length < 8) {
      throw new Error('La clave API es demasiado corta')
    }
    await rt().saveApiKey(provider, payload.apiKey.trim())
    return { provider }
  })
  handle(IpcChannel.AiDeleteApiKey, async (payload: { provider: string }) => {
    const provider = providerIdSchema.parse(payload.provider)
    await rt().deleteApiKey(provider)
    return { provider }
  })
  handle(IpcChannel.AiApiKeyStatus, async (payload: { provider: string }) => {
    const provider = providerIdSchema.parse(payload.provider)
    return { provider, set: await rt().hasApiKey(provider) }
  })

  // OCR
  handle(IpcChannel.OcrHealth, async () => {
    const engine = rt().ocrEngine
    if (!engine) return { ok: false, engine: 'none', error: 'OCR no disponible' }
    return engine.health()
  })

  // Settings
  handle(IpcChannel.SettingsGet, async () => rt().settingsService.get())
  handle(IpcChannel.SettingsSet, async (patch) => {
    const settings = appSettingsSchema.parse(patch)
    const updated = await rt().settingsService.update(settings)
    await rt().refreshServices()
    return updated
  })

  // Backups
  handle(IpcChannel.BackupsCreate, async () => {
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
  handle(IpcChannel.UpdatesInstall, async () => {
    await rt().updates.install()
    return { ok: true }
  })
  handle(IpcChannel.UpdatesState, async () => rt().updates.getState())

  // Automations
  handle(IpcChannel.AutomationsList, async () => rt().automationService.list())
  handle(IpcChannel.AutomationsCreate, async (input) => {
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
    await rt().automationService.setEnabled(payload.id, payload.enabled)
    await rt().auditService.record({
      action: payload.enabled ? 'automation.enable' : 'automation.disable',
      entityType: 'automation',
      entityId: String(payload.id),
    })
    return { id: payload.id, enabled: payload.enabled }
  })
  handle(IpcChannel.AutomationsRemove, async (id: number) => {
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
    bus.on('ai:progress', (p) => send(IpcEvent.EventAiProgress, p)),
    bus.on('notification', (p) => send(IpcEvent.EventNotification, p)),
    bus.on('automation:run', (p) => send(IpcEvent.EventAutomationRun, p)),
  ]
  return () => subs.forEach((unsub) => unsub())
}
