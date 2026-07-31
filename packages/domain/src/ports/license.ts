import type { License, LicensePayload } from '../entities/license'

/** Persistencia de la licencia local activa (una por instalación). */
export interface LicenseRepository {
  get(): Promise<License | null>
  set(license: License): Promise<void>
  clear(): Promise<void>
}

/**
 * Transporte con el servidor de licencias online. La activación devuelve la
 * carga firmada; la verificación de la firma es local (offline).
 */
export interface LicenseServer {
  activate(key: string, deviceId: string): Promise<{ payload: LicensePayload; signature: string }>
  deactivate(deviceId: string): Promise<void>
}

/** Verifica la firma Ed25519 de una carga de licencia (sin conexión). */
export interface LicenseVerifier {
  verify(payload: LicensePayload, signature: string): Promise<boolean>
}
