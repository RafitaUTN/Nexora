import type { ProviderId } from '../entities/settings'

/** Claves de SecretKind: proveedores de IA, la sesión persistida y la sesión de sync. */
export type SecretKind = ProviderId | 'session' | 'sync'

/**
 * Almacén seguro de secretos. La implementación cifra con AES-256-GCM y
 * persiste en la base local; nunca en texto plano.
 */
export interface SecretStore {
  set(kind: SecretKind, value: string): Promise<void>
  get(kind: SecretKind): Promise<string | null>
  has(kind: SecretKind): Promise<boolean>
  delete(kind: SecretKind): Promise<void>
}
