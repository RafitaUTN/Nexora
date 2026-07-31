import type { SecretKind, SecretStore } from '@documind/domain'
import type { SqliteDatabase } from '../db/database'
import type { AesGcm } from '../crypto/aes'

/**
 * Adaptador SecretStore sobre SQLite. Los valores se cifran con AES-256-GCM
 * usando un AesGcm construido con el secreto maestro (safeStorage en Electron).
 */
export class SqliteSecretStore implements SecretStore {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly cipher: AesGcm,
  ) {}

  async set(kind: SecretKind, value: string): Promise<void> {
    const encrypted = this.cipher.encrypt(value)
    this.db
      .prepare(
        `INSERT INTO secrets (kind, ciphertext, iv, auth_tag, salt, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(kind) DO UPDATE SET
           ciphertext = excluded.ciphertext,
           iv = excluded.iv,
           auth_tag = excluded.auth_tag,
           salt = excluded.salt,
           updated_at = datetime('now')`,
      )
      .run(kind, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.salt)
  }

  async get(kind: SecretKind): Promise<string | null> {
    const row = this.db
      .prepare(`SELECT ciphertext, iv, auth_tag, salt FROM secrets WHERE kind = ?`)
      .get(kind) as { ciphertext: Buffer; iv: Buffer; auth_tag: Buffer; salt: Buffer } | undefined
    if (!row) return null
    try {
      return this.cipher.decrypt({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
        salt: row.salt,
      })
    } catch {
      return null
    }
  }

  async has(kind: SecretKind): Promise<boolean> {
    const row = this.db.prepare(`SELECT 1 AS n FROM secrets WHERE kind = ?`).get(kind) as
      | { n: number }
      | undefined
    return row !== undefined
  }

  async delete(kind: SecretKind): Promise<void> {
    this.db.prepare(`DELETE FROM secrets WHERE kind = ?`).run(kind)
  }
}
