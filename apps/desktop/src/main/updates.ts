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
 * Feed de actualizaciones para pruebas locales. Si se define, el autoUpdater
 * ignora GitHub Releases y consulta esta URL (provider «generic»), sirviendo
 * `latest.yml` + instalador desde un servidor propio. P. ej.:
 * `DOCUMIND_UPDATE_URL=http://192.168.1.10:8080/`
 */
const UPDATE_FEED_URL = process.env.DOCUMIND_UPDATE_URL

/**
 * Gestión de actualizaciones con electron-updater contra GitHub Releases.
 * En desarrollo el autoUpdater no está disponible: se notifica «current».
 */
export class UpdateManager {
  private listeners = new Set<(status: UpdateStatus) => void>()
  private state: UpdateStatus = { status: 'idle', currentVersion: APP_VERSION }
  private started = false
  private autoCheckTimer: NodeJS.Timeout | null = null
  private disposed = false

  constructor(private readonly settings: SettingsService) {}

  /**
   * Programa el chequeo automático periódico. Lee `autoCheck` y
   * `checkIntervalHours` de los ajustes en cada ciclo, por lo que un cambio
   * en Ajustes se refleja sin reiniciar. Solo se ejecuta con la app empaquetada.
   */
  startAutoCheck(): void {
    if (this.autoCheckTimer) return
    // El módulo `electron` solo está disponible en el proceso principal real;
    // bajo tsx (smoke) no existe, así que se ignora silenciosamente.
    void import('electron')
      .then(({ app }) => {
        if (!app.isPackaged) return
        this.start()
        this.autoCheckTimer = setTimeout(() => void this.runAutoCheckLoop(), 15_000)
      })
      .catch(() => undefined)
  }

  private async runAutoCheckLoop(): Promise<void> {
    const settings = await this.settings.get()
    if (!this.disposed && settings.updates.autoCheck) {
      await this.check()
    }
    if (this.disposed) return
    const hours = Math.max(1, settings.updates.checkIntervalHours)
    this.autoCheckTimer = setTimeout(() => void this.runAutoCheckLoop(), hours * 3_600_000)
  }

  dispose(): void {
    this.disposed = true
    if (this.autoCheckTimer) clearTimeout(this.autoCheckTimer)
    this.autoCheckTimer = null
  }

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
      updater.autoDownload = false
      updater.autoInstallOnAppQuit = true
      if (UPDATE_FEED_URL) {
        updater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL })
      }
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

  /** Descarga la actualización disponible (tras confirmar el usuario). */
  async download(): Promise<UpdateStatus> {
    this.start()
    if (this.state.status !== 'available') return this.state
    try {
      await electronUpdater.autoUpdater.downloadUpdate()
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
}
