import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

export const AES_KEY_LENGTH = 32
export const AES_IV_LENGTH = 12
export const AES_AUTH_TAG_LENGTH = 16
const PBKDF2_ITERATIONS = 250_000

export interface EncryptedPayload {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
  salt: Buffer
}

/**
 * Cifrado simétrico AES-256-GCM. La clave se deriva del secreto maestro con
 * PBKDF2-SHA256 y un salt aleatorio por registro.
 */
export class AesGcm {
  constructor(private readonly masterSecret: string) {
    if (masterSecret.length < 16) {
      throw new Error('El secreto maestro debe tener al menos 16 caracteres')
    }
  }

  encrypt(plaintext: string): EncryptedPayload {
    const salt = randomBytes(16)
    const iv = randomBytes(AES_IV_LENGTH)
    const key = this.deriveKey(salt)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return { ciphertext, iv, authTag: cipher.getAuthTag(), salt }
  }

  decrypt(payload: EncryptedPayload): string {
    const key = this.deriveKey(payload.salt)
    const decipher = createDecipheriv('aes-256-gcm', key, payload.iv)
    decipher.setAuthTag(payload.authTag)
    return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]).toString('utf8')
  }

  verifyTag(authTag: Buffer, expectedTag: Buffer): boolean {
    if (authTag.length !== expectedTag.length) return false
    return timingSafeEqual(authTag, expectedTag)
  }

  private deriveKey(salt: Buffer): Buffer {
    return pbkdf2Sync(this.masterSecret, salt, PBKDF2_ITERATIONS, AES_KEY_LENGTH, 'sha256')
  }
}

export function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}
