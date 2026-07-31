import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { PasswordHasher } from '@documind/domain'

export const SCRYPT_SALT_BYTES = 16
export const SCRYPT_KEY_BYTES = 64
export const SCRYPT_DEFAULT_COST = { N: 2 ** 15, r: 8, p: 1 }

/**
 * PasswordHasher con scrypt (node:crypto). Formato PHC propio:
 * `$scrypt$N=<cost>,r=<block>,p=<parallel>$<salt b64>$<hash b64>`.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost = SCRYPT_DEFAULT_COST) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SCRYPT_SALT_BYTES)
    const derived = this.derive(password, salt)
    const { N, r, p } = this.cost
    return `$scrypt$N=${N},r=${r},p=${p}$${salt.toString('base64')}$${derived.toString('base64')}`
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$')
    if (parts.length !== 5 || parts[1] !== 'scrypt') return false
    const [paramsText, saltText, hashText] = parts.slice(2)
    if (!paramsText || !saltText || !hashText) return false
    const params = new Map(
      paramsText.split(',').map((kv) => {
        const [k, v] = kv.split('=')
        return [k, Number(v)]
      }),
    )
    const N = params.get('N')
    const r = params.get('r')
    const p = params.get('p')
    if (!N || !r || !p || !Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false
    }
    let salt: Buffer
    let expected: Buffer
    try {
      salt = Buffer.from(saltText, 'base64')
      expected = Buffer.from(hashText, 'base64')
    } catch {
      return false
    }
    if (expected.length !== SCRYPT_KEY_BYTES) return false
    const derived = this.derive(password, salt, { N, r, p })
    return timingSafeEqual(derived, expected)
  }

  private derive(
    password: string,
    salt: Buffer,
    cost: { N: number; r: number; p: number } = this.cost,
  ): Buffer {
    return scryptSync(password, salt, SCRYPT_KEY_BYTES, { ...cost, maxmem: 128 * 1024 * 1024 })
  }
}
