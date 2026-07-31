import type { ProviderId } from '../entities/settings'

export type SecretKind = ProviderId

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
