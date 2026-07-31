import type { SyncChange, SyncSettings, SyncStatus } from '../entities/sync'

/**
 * Almacén remoto de sincronización (Supabase/Postgres).
 * Operaciones idempotentes por clave `(device_id, entity_key)`.
 */
export interface SyncRemoteStore {
  /** Envía los cambios locales al servidor (UPSERT). */
  push(changes: SyncChange[]): Promise<void>
  /** Recibe cambios de otros dispositivos posteriores a `sinceMs`. */
  pull(sinceMs: number): Promise<SyncChange[]>
  ping(): Promise<void>
}

/**
 * Almacén local de sincronización (SQLite).
 * Lee el outbox y aplica cambios remotos con política LWW.
 */
export interface SyncLocalStore {
  /** Cambios pendientes de subir (synced = false). */
  pending(): Promise<SyncChange[]>
  /** Marca cambios como sincronizados. */
  markSynced(keys: string[]): Promise<void>
  /**
   * Aplica cambios remotos con LWW: por cada cambio descarta los que lleven
   * un `updatedAtMs` menor o igual al estado local. Devuelve `{ applied, skipped }`.
   */
  applyRemote(changes: SyncChange[]): Promise<{ applied: number; skipped: number }>
  getSettings(): Promise<SyncSettings>
  saveSettings(settings: SyncSettings): Promise<void>
  getDeviceId(): Promise<string>
  status(): Promise<Omit<SyncStatus, 'url' | 'configured' | 'anonKeySet'>>
}
