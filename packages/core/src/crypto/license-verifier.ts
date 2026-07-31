import { createPublicKey, verify } from 'node:crypto'
import type { LicensePayload, LicenseVerifier } from '@documind/domain'

/**
 * Clave pública Ed25519 (SPKI/DER, base64) del servidor de licencias.
 * Solo viaja la pública con la aplicación; la privada vive en el servidor.
 * Es un placeholder de desarrollo: en producción se sustituye por la real.
 */
export const DEFAULT_LICENSE_PUBLIC_KEY_B64 =
  'MCowBQYDK2VwAyEAWSLi7kV8ptJro9GfGL37jiIGMd0+LVb8nVUxxLi3qOw='

/** JSON canónico (claves ordenadas) para que la firma sea determinista. */
export function canonicalJson(value: unknown): string {
  const source = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) sorted[key] = source[key]
  return JSON.stringify(sorted)
}

/** Verifica la firma Ed25519 de una carga de licencia (sin conexión). */
export class CryptoLicenseVerifier implements LicenseVerifier {
  private readonly key: ReturnType<typeof createPublicKey>

  constructor(publicKeyB64: string = DEFAULT_LICENSE_PUBLIC_KEY_B64) {
    this.key = createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    })
  }

  async verify(payload: LicensePayload, signatureB64: string): Promise<boolean> {
    try {
      return verify(
        null,
        Buffer.from(canonicalJson(payload)),
        this.key,
        Buffer.from(signatureB64, 'base64'),
      )
    } catch {
      return false
    }
  }
}
