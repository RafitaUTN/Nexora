import type { License, LicensePayload, LicenseTier } from '../entities/license'
import { TIER_RANK, freeLicense, licenseKeySchema } from '../entities/license'
import type { LicenseRepository, LicenseServer, LicenseVerifier } from '../ports/license'

export class LicenseError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'ERR_LICENSE'
      | 'ERR_LICENSE_INVALID_KEY'
      | 'ERR_LICENSE_REVOKED'
      | 'ERR_LICENSE_EXPIRED'
      | 'ERR_LICENSE_NETWORK'
      | 'ERR_LICENSE_SERVER',
  ) {
    super(message)
    this.name = 'LicenseError'
  }
}

/**
 * Ciclo de vida de la licencia. La activación se delega al servidor online y
 * la respuesta firmada se verifica localmente (Ed25519), de modo que un
 * servidor comprometido o una fila manipulada en la base no puedan emitir
 * licencias válidas. El estado se re-evalúa en cada `status()`/`isEntitled()`.
 */
export class LicenseService {
  constructor(
    private readonly repo: LicenseRepository,
    private readonly verifier: LicenseVerifier,
    private readonly server: LicenseServer,
    private readonly deviceId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async status(): Promise<License> {
    const stored = await this.repo.get()
    if (!stored || stored.tier === 'free') return freeLicense()
    if (!stored.signature || !stored.activatedAt) return { ...stored, status: 'revoked' }
    if (!(await this.verifier.verify(payloadOf(stored), stored.signature))) {
      return { ...stored, status: 'revoked' }
    }
    if (isExpired(payloadOf(stored), this.now())) {
      return { ...stored, status: 'expired' }
    }
    return stored
  }

  async activate(key: string): Promise<License> {
    const parsed = licenseKeySchema.parse(key)
    const { payload, signature } = await this.server.activate(parsed, this.deviceId)
    if (payload.deviceId !== this.deviceId) {
      throw new LicenseError('La licencia está vinculada a otro dispositivo', 'ERR_LICENSE_INVALID_KEY')
    }
    if (!(await this.verifier.verify(payload, signature))) {
      throw new LicenseError('Firma de licencia no válida', 'ERR_LICENSE_INVALID_KEY')
    }
    if (isExpired(payload, this.now())) {
      throw new LicenseError('La licencia ya ha expirado', 'ERR_LICENSE_EXPIRED')
    }
    const license: License = {
      tier: payload.tier,
      status: 'active',
      activatedAt: payload.activatedAt,
      expiresAt: payload.expiresAt || null,
      deviceId: payload.deviceId,
      keySha256: payload.keySha256,
      maxDevices: payload.maxDevices,
      signature,
    }
    await this.repo.set(license)
    return license
  }

  async deactivate(): Promise<void> {
    const stored = await this.repo.get()
    if (stored && stored.tier !== 'free') {
      try {
        await this.server.deactivate(this.deviceId)
      } catch {
        // Best-effort: si el servidor no responde se revoca localmente igualmente.
      }
    }
    await this.repo.clear()
  }

  async isEntitled(tier: LicenseTier): Promise<boolean> {
    const license = await this.status()
    if (license.status !== 'active') return false
    if (isExpired(payloadOf(license), this.now())) return false
    return TIER_RANK[license.tier] >= TIER_RANK[tier]
  }
}

/** Reconstruye la carga firmada a partir de la licencia almacenada. */
function payloadOf(license: License): LicensePayload {
  return {
    keySha256: license.keySha256 ?? '',
    tier: license.tier,
    deviceId: license.deviceId ?? '',
    activatedAt: license.activatedAt ?? '',
    expiresAt: license.expiresAt ?? '',
    maxDevices: license.maxDevices ?? 1,
  }
}

function isExpired(payload: LicensePayload, now: Date): boolean {
  return Boolean(payload.expiresAt && new Date(payload.expiresAt).getTime() < now.getTime())
}
