import electronUpdater from 'electron-updater'
import type { SettingsService } from '@documind/domain'
import { APP_VERSION } from '@documind/shared'

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  latestVersion?: string
  progress?: number
  message?: string
}

/**
 * Gestión de actualizaciones con electron-updater contra GitHub Releases.
 * En desarrollo el autoUpdater no está disponible: se notifica «current».
 */
export class UpdateManager {
  private listeners = new Set<(status: UpdateStatus) => void>()
  private state: UpdateStatus = { status: 'idle', currentVersion: APP_VERSION }
  private started = false

  constructor(private readonly settings: SettingsService) {}

  onStatus(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState(): UpdateStatus {
    return this.state
  }

  private notify(status: UpdateStatus): void {
    this.state = status
    for (const listener of this.listeners) listener(status)
  }

  private start(): void {
    if (this.started) return
    this.started = true
    try {
      const updater = electronUpdater.autoUpdater
      updater.logger = console
      updater.autoDownload = true
      updater.autoInstallOnAppQuit = true
      updater.on('checking-for-update', () =>
        this.notify({ status: 'checking', currentVersion: APP_VERSION }),
      )
      updater.on('update-available', (info) =>
        this.notify({
          status: 'available',
          currentVersion: APP_VERSION,
          latestVersion: info.version,
        }),
      )
      updater.on('update-not-available', () =>
        this.notify({ status: 'current', currentVersion: APP_VERSION }),
      )
      updater.on('download-progress', (progress) =>
        this.notify({
          status: 'downloading',
          currentVersion: APP_VERSION,
          progress: Math.round(progress.percent),
        }),
      )
      updater.on('update-downloaded', (info) =>
        this.notify({
          status: 'downloaded',
          currentVersion: APP_VERSION,
          latestVersion: info.version,
          progress: 100,
        }),
      )
      updater.on('error', (error) =>
        this.notify({
          status: 'error',
          currentVersion: APP_VERSION,
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    } catch (error) {
      // En desarrollo o sin electron-updater empaquetado no hay autoUpdater.
      this.notify({
        status: 'error',
        currentVersion: APP_VERSION,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async check(): Promise<UpdateStatus> {
    this.start()
    if (this.state.status === 'error') return this.state
    const settings = await this.settings.get()
    if (!settings.updates.autoCheck) {
      return this.finalize({ status: 'current', currentVersion: APP_VERSION })
    }
    try {
      await electronUpdater.autoUpdater.checkForUpdates()
    } catch (error) {
      this.notify({
        status: 'error',
        currentVersion: APP_VERSION,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return this.state
  }

  async install(): Promise<{ ok: boolean }> {
    this.start()
    electronUpdater.autoUpdater.quitAndInstall()
    return { ok: true }
  }

  private finalize(status: UpdateStatus): UpdateStatus {
    this.notify(status)
    return status
  }
}
