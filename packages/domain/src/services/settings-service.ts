import type { AppSettings } from '../entities/settings'
import { appSettingsSchema, defaultSettings } from '../entities/settings'
import type { SettingsRepository } from '../ports/repositories'

const SETTINGS_KEY = 'app.settings'

/**
 * Gestión de configuración de la aplicación con validación Zod.
 */
export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async get(): Promise<AppSettings> {
    const raw = await this.repo.get(SETTINGS_KEY)
    if (raw === null) return defaultSettings()
    try {
      return appSettingsSchema.parse(JSON.parse(raw))
    } catch {
      return defaultSettings()
    }
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get()
    const merged = appSettingsSchema.parse({ ...current, ...patch })
    await this.repo.set(SETTINGS_KEY, JSON.stringify(merged))
    return merged
  }
}
