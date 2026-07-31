import type {
  SyncChange,
  SyncErrorCode,
  SyncResult,
  SyncStatus,
} from '../entities/sync'
import type { SyncLocalStore, SyncRemoteStore } from '../ports/sync'

/** Clave compuesta local `entity:entityKey` (los IDs pueden colisionar entre entidades). */
export function keyOf(change: Pick<SyncChange, 'entity' | 'entityKey'>): string {
  return `${change.entity}:${change.entityKey}`
}

/**
 * Orquestador de sincronización con política LWW.
 *
 * `sync()`: 1) sube los cambios locales pendientes, 2) trae los cambios
 * remotos posteriores al último pull, 3) los aplica localmente con LWW y
 * 4) avanza `lastPullMs`. Idempotente: el UPSERT remoto y el filtro local
 * por `updatedAtMs` hacen seguro repetir la operación.
 */
export class SyncService {
  constructor(
    private readonly local: SyncLocalStore,
    private readonly remote: SyncRemoteStore,
  ) {}

  async status(): Promise<SyncStatus> {
    const settings = await this.local.getSettings()
    const base = await this.local.status()
    return {
      ...base,
      enabled: settings.enabled,
      configured: settings.url.length > 0 && settings.anonKey.length > 0,
      url: settings.url,
      anonKeySet: settings.anonKey.length > 0,
      authenticated: settings.email.length > 0,
      email: settings.email,
    }
  }

  async setEnabled(enabled: boolean): Promise<SyncStatus> {
    const settings = await this.local.getSettings()
    await this.local.saveSettings({ ...settings, enabled })
    return this.status()
  }

  async configure(url: string, anonKey: string, email = ''): Promise<SyncStatus> {
    const settings = await this.local.getSettings()
    await this.local.saveSettings({ ...settings, url, anonKey, email })
    return this.status()
  }

  /** Verifica la conectividad con el servidor remoto (configurado y alcanzable). */
  async ping(): Promise<void> {
    const settings = await this.local.getSettings()
    if (!settings.enabled) throw this.error('ERR_SYNC_DISABLED', 'Sincronización deshabilitada')
    if (!settings.url || !settings.anonKey) {
      throw this.error('ERR_SYNC_NOT_CONFIGURED', 'Sincronización no configurada')
    }
    await this.remote.ping()
  }

  async sync(): Promise<SyncResult> {
    const settings = await this.local.getSettings()
    if (!settings.enabled) throw this.error('ERR_SYNC_DISABLED', 'Sincronización deshabilitada')
    if (!settings.url || !settings.anonKey) {
      throw this.error('ERR_SYNC_NOT_CONFIGURED', 'Sincronización no configurada')
    }

    const pending = await this.local.pending()
    if (pending.length > 0) {
      await this.remote.push(pending)
      await this.local.markSynced(pending)
    }

    const remoteChanges = await this.remote.pull(settings.lastPullMs)
    const { applied, skipped } = await this.local.applyRemote(remoteChanges)
    await this.local.saveSettings({ ...settings, lastPullMs: Date.now() })

    return { pushed: pending.length, pulled: remoteChanges.length, applied, skipped }
  }

  private error(code: SyncErrorCode, message: string): Error {
    return new Error(`${message} (${code})`)
  }
}

export type { SyncChange }
