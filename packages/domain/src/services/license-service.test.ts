import { describe, expect, it } from 'vitest'
import { LicenseService, LicenseError } from './license-service'
import {
  FakeLicenseRepository,
  FakeLicenseServer,
  FakeLicenseVerifier,
} from '../test/fakes'
import type { License, LicensePayload } from '../entities/license'

const NOW = new Date('2026-07-01T00:00:00Z')
const DEVICE = 'device-abc'

function makePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    keySha256: 'abc123hash',
    tier: 'pro',
    deviceId: DEVICE,
    activatedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '',
    maxDevices: 3,
    ...overrides,
  }
}

function setup() {
  const repo = new FakeLicenseRepository()
  const verifier = new FakeLicenseVerifier()
  const server = new FakeLicenseServer()
  const service = new LicenseService(repo, verifier, server, DEVICE, () => NOW)
  return { repo, verifier, server, service }
}

const activeLicense = (overrides: Partial<License> = {}): License => ({
  tier: 'pro',
  status: 'active',
  activatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  deviceId: DEVICE,
  keySha256: 'abc123hash',
  maxDevices: 3,
  signature: 'sig',
  ...overrides,
})

describe('LicenseService', () => {
  describe('status', () => {
    it('devuelve free sin licencia almacenada', async () => {
      const { service } = setup()
      const license = await service.status()
      expect(license.tier).toBe('free')
      expect(license.status).toBe('active')
      expect(license.keySha256).toBeNull()
    })

    it('re-evalúa la firma y marca revocada si no verifica', async () => {
      const { repo, verifier, service } = setup()
      verifier.valid = false
      await repo.set(activeLicense())
      const license = await service.status()
      expect(license.status).toBe('revoked')
    })

    it('marca expirada si la fecha de expiración ya pasó', async () => {
      const { repo, service } = setup()
      await repo.set(activeLicense({ expiresAt: '2026-06-01T00:00:00.000Z' }))
      const license = await service.status()
      expect(license.status).toBe('expired')
    })

    it('devuelve la licencia vigente sin cambios', async () => {
      const { repo, service } = setup()
      await repo.set(activeLicense())
      const license = await service.status()
      expect(license).toMatchObject({ tier: 'pro', status: 'active', deviceId: DEVICE })
    })

    it('marca revocada una licencia sin firma', async () => {
      const { repo, service } = setup()
      await repo.set(activeLicense({ signature: null }))
      const license = await service.status()
      expect(license.status).toBe('revoked')
    })
  })

  describe('activate', () => {
    it('activa y persiste la licencia firmada', async () => {
      const { repo, server, service } = setup()
      server.result = { payload: makePayload(), signature: 'sig' }
      const license = await service.activate('ABCD-1234-EFGH-5678')
      expect(license).toMatchObject({ tier: 'pro', status: 'active', deviceId: DEVICE })
      expect(repo.license).toMatchObject({ tier: 'pro', keySha256: 'abc123hash' })
      expect(server.activatedKeys).toEqual(['ABCD-1234-EFGH-5678'])
    })

    it('rechaza una clave con formato inválido', async () => {
      const { service } = setup()
      await expect(service.activate('corta')).rejects.toThrow()
    })

    it('rechaza una licencia vinculada a otro dispositivo', async () => {
      const { server, service } = setup()
      server.result = { payload: makePayload({ deviceId: 'other-device' }), signature: 'sig' }
      await expect(service.activate('ABCD-1234-EFGH-5678')).rejects.toMatchObject({
        code: 'ERR_LICENSE_INVALID_KEY',
      })
    })

    it('rechaza una firma no válida', async () => {
      const { server, verifier, service } = setup()
      verifier.valid = false
      server.result = { payload: makePayload(), signature: 'sig' }
      await expect(service.activate('ABCD-1234-EFGH-5678')).rejects.toMatchObject({
        code: 'ERR_LICENSE_INVALID_KEY',
      })
    })

    it('rechaza una licencia ya expirada', async () => {
      const { server, service } = setup()
      server.result = {
        payload: makePayload({ expiresAt: '2026-06-01T00:00:00.000Z' }),
        signature: 'sig',
      }
      await expect(service.activate('ABCD-1234-EFGH-5678')).rejects.toMatchObject({
        code: 'ERR_LICENSE_EXPIRED',
      })
    })

    it('propaga el error del servidor (red no disponible)', async () => {
      const { server, service } = setup()
      server.error = new LicenseError('No se pudo conectar', 'ERR_LICENSE_NETWORK')
      await expect(service.activate('ABCD-1234-EFGH-5678')).rejects.toMatchObject({
        code: 'ERR_LICENSE_NETWORK',
      })
    })
  })

  describe('deactivate', () => {
    it('notifica al servidor y limpia la licencia local', async () => {
      const { repo, server, service } = setup()
      await repo.set(activeLicense())
      await service.deactivate()
      expect(server.deactivated).toBe(true)
      expect(repo.license).toBeNull()
    })

    it('limpia localmente aunque el servidor no responda', async () => {
      const { repo, server, service } = setup()
      await repo.set(activeLicense())
      server.error = new Error('offline')
      await service.deactivate()
      expect(repo.license).toBeNull()
    })

    it('no llama al servidor sin licencia activa', async () => {
      const { server, service } = setup()
      await service.deactivate()
      expect(server.deactivated).toBe(false)
    })
  })

  describe('isEntitled', () => {
    it('free no da acceso a pro', async () => {
      const { service } = setup()
      expect(await service.isEntitled('pro')).toBe(false)
      expect(await service.isEntitled('free')).toBe(true)
    })

    it('pro otorga pro y free', async () => {
      const { repo, service } = setup()
      await repo.set(activeLicense())
      expect(await service.isEntitled('pro')).toBe(true)
      expect(await service.isEntitled('enterprise')).toBe(false)
    })

    it('licencia expirada no otorga nada', async () => {
      const { repo, service } = setup()
      await repo.set(activeLicense({ expiresAt: '2026-06-01T00:00:00.000Z' }))
      expect(await service.isEntitled('free')).toBe(false)
    })

    it('licencia revocada no otorga nada', async () => {
      const { repo, verifier, service } = setup()
      verifier.valid = false
      await repo.set(activeLicense())
      expect(await service.isEntitled('pro')).toBe(false)
    })
  })
})
