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
 * Lee el outbox y aplica cambios remotos con resolución de conflictos por
 * campos (merge): si hay un cambio local pendiente de la misma clave, se
 * combinan ambos payloads campo a campo en lugar de descartar una versión
 * entera (LWW por fila).
 */
export interface SyncLocalStore {
  /** Cambios pendientes de subir (synced = false). */
  pending(): Promise<SyncChange[]>
  /**
   * Marca cambios como sincronizados y guarda su payload como línea base
   * para la resolución de conflictos por campos en futuros pulls.
   */
  markSynced(changes: SyncChange[]): Promise<void>
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
