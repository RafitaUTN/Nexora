import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { canonicalJson, CryptoLicenseVerifier } from './license-verifier'
import type { LicensePayload } from '@documind/domain'

function keyPair() {
  return generateKeyPairSync('ed25519')
}

const payload: LicensePayload = {
  keySha256: 'abc123',
  tier: 'pro',
  deviceId: 'device-1',
  activatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  maxDevices: 3,
}

describe('canonicalJson', () => {
  it('serializa con claves ordenadas (firma determinista)', () => {
    const a = JSON.parse(canonicalJson({ b: 1, a: 2 })) as Record<string, number>
    expect(Object.keys(a)).toEqual(['a', 'b'])
    expect(canonicalJson({ a: 2, b: 1 })).toBe(canonicalJson({ b: 1, a: 2 }))
  })
})

describe('CryptoLicenseVerifier', () => {
  it('verifica una firma válida', async () => {
    const { privateKey, publicKey } = keyPair()
    const verifier = new CryptoLicenseVerifier(publicKey.export({ format: 'der', type: 'spki' }).toString('base64'))
    const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64')
    expect(await verifier.verify(payload, signature)).toBe(true)
  })

  it('rechaza una carga manipulada', async () => {
    const { privateKey, publicKey } = keyPair()
    const verifier = new CryptoLicenseVerifier(publicKey.export({ format: 'der', type: 'spki' }).toString('base64'))
    const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64')
    const tampered = { ...payload, tier: 'enterprise' as const }
    expect(await verifier.verify(tampered, signature)).toBe(false)
  })

  it('rechaza una firma de otra clave', async () => {
    const keyA = keyPair()
    const keyB = keyPair()
    const verifier = new CryptoLicenseVerifier(
      keyA.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    )
    const signature = sign(null, Buffer.from(canonicalJson(payload)), keyB.privateKey).toString('base64')
    expect(await verifier.verify(payload, signature)).toBe(false)
  })

  it('devuelve false con datos corruptos', async () => {
    const { publicKey } = keyPair()
    const verifier = new CryptoLicenseVerifier(publicKey.export({ format: 'der', type: 'spki' }).toString('base64'))
    const shortSignature = Buffer.alloc(32).toString('base64')
    expect(await verifier.verify(payload, shortSignature)).toBe(false)
    expect(await verifier.verify(payload, 'no-es-base64!!!')).toBe(false)
  })
})
