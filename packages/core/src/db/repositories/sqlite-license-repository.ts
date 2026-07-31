import type { License, LicenseRepository } from '@documind/domain'
import type { SqliteDatabase } from '../database'

interface LicenseRow {
  tier: string
  status: string
  key_sha256: string | null
  device_id: string | null
  activated_at: string | null
  expires_at: string | null
  max_devices: number | null
  signature: string | null
}

/** Licencia local activa (una por instalación, fila fija id=1). */
export class SqliteLicenseRepository implements LicenseRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async get(): Promise<License | null> {
    const row = this.db
      .prepare(
        `SELECT tier, status, key_sha256, device_id, activated_at, expires_at, max_devices, signature
         FROM licenses WHERE id = 1`,
      )
      .get() as LicenseRow | undefined
    if (!row) return null
    return {
      tier: row.tier as License['tier'],
      status: row.status as License['status'],
      activatedAt: row.activated_at,
      expiresAt: row.expires_at,
      deviceId: row.device_id,
      keySha256: row.key_sha256,
      maxDevices: row.max_devices,
      signature: row.signature,
    }
  }

  async set(license: License): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO licenses
           (id, tier, status, key_sha256, device_id, activated_at, expires_at, max_devices, signature, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           tier = excluded.tier,
           status = excluded.status,
           key_sha256 = excluded.key_sha256,
           device_id = excluded.device_id,
           activated_at = excluded.activated_at,
           expires_at = excluded.expires_at,
           max_devices = excluded.max_devices,
           signature = excluded.signature,
           updated_at = datetime('now')`,
      )
      .run(
        license.tier,
        license.status,
        license.keySha256,
        license.deviceId,
        license.activatedAt,
        license.expiresAt,
        license.maxDevices,
        license.signature,
      )
  }

  async clear(): Promise<void> {
    this.db.prepare(`DELETE FROM licenses WHERE id = 1`).run()
  }
}
