import { APP_NAME, APP_VERSION } from '@documind/shared'
import type { SettingsService } from '@documind/domain'

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'error'
  currentVersion: string
  latestVersion?: string
  message?: string
}

/**
 * Gestión de actualizaciones. En FASE 7 se conectará a electron-updater
 * (GitHub Releases). Por ahora notifica el estado actual y no descarga nada.
 */
export class UpdateManager {
  private listeners = new Set<(status: UpdateStatus) => void>()
  private state: UpdateStatus = { status: 'idle', currentVersion: APP_VERSION }

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

  async check(): Promise<UpdateStatus> {
    this.notify({ status: 'checking', currentVersion: APP_VERSION })
    const settings = await this.settings.get()
    if (!settings.updates.autoCheck) {
      return this.finalize({ status: 'current', currentVersion: APP_VERSION })
    }
    // TODO(FASE 7): electron-updater contra GitHub Releases.
    await new Promise((r) => setTimeout(r, 150))
    return this.finalize({ status: 'current', currentVersion: APP_VERSION })
  }

  async install(): Promise<void> {
    throw new Error('No hay actualización disponible para instalar')
  }

  private finalize(status: UpdateStatus): UpdateStatus {
    this.notify(status)
    return status
  }
}

export function updateProductName(): string {
  return APP_NAME
}
