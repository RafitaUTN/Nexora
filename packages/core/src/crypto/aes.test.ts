import { describe, expect, it } from 'vitest'
import { AesGcm, AES_AUTH_TAG_LENGTH, randomHex } from './aes'

const MASTER = 'un-secreto-muy-largo-y-seguro-123456'

describe('AesGcm', () => {
  it('cifra y descifra correctamente', () => {
    const cipher = new AesGcm(MASTER)
    const payload = cipher.encrypt('sk-secret-api-key')
    expect(payload.ciphertext).not.toContain('sk-')
    expect(cipher.decrypt(payload)).toBe('sk-secret-api-key')
  })

  it('usa un salt e IV aleatorios por cifrado (mismo texto, distinto payload)', () => {
    const cipher = new AesGcm(MASTER)
    const a = cipher.encrypt('mismo texto')
    const b = cipher.encrypt('mismo texto')
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.salt.equals(b.salt)).toBe(false)
  })

  it('detecta manipulación del texto cifrado (GCM auth tag)', () => {
    const cipher = new AesGcm(MASTER)
    const payload = cipher.encrypt('datos sensibles')
    payload.ciphertext = Buffer.concat([payload.ciphertext, Buffer.from([0xff])])
    expect(() => cipher.decrypt(payload)).toThrow()
  })

  it('verifica el tag con timingSafeEqual', () => {
    const cipher = new AesGcm(MASTER)
    const payload = cipher.encrypt('x')
    const other = new AesGcm(MASTER).encrypt('y')
    expect(cipher.verifyTag(payload.authTag, payload.authTag)).toBe(true)
    expect(cipher.verifyTag(payload.authTag, other.authTag)).toBe(false)
    expect(cipher.verifyTag(payload.authTag, Buffer.alloc(AES_AUTH_TAG_LENGTH - 1))).toBe(false)
  })

  it('no descifra con otro secreto maestro', () => {
    const payload = new AesGcm(MASTER).encrypt('secreto')
    expect(() => new AesGcm('otra-clave-master-distinta-abcdef').decrypt(payload)).toThrow()
  })

  it('exige un secreto maestro de al menos 16 caracteres', () => {
    expect(() => new AesGcm('corta')).toThrow()
  })

  it('randomHex genera bytes del tamaño pedido en hex', () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/)
    expect(randomHex(32)).toHaveLength(64)
  })
})
