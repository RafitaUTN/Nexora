import { describe, afterEach, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteDatabase } from '../database'
import { runMigrations } from '../migrations'
import { SqliteLicenseRepository } from './sqlite-license-repository'
import type { License } from '@documind/domain'

describe('SqliteLicenseRepository', () => {
  const dbs: SqliteDatabase[] = []

  function freshRepo(): { repo: SqliteLicenseRepository; db: SqliteDatabase } {
    const dir = mkdtempSync(join(tmpdir(), 'documind-lic-'))
    const db = new SqliteDatabase(join(dir, 'test.db'))
    runMigrations(db)
    dbs.push(db)
    return { repo: new SqliteLicenseRepository(db), db }
  }

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      db.checkpoint()
      db.close()
    }
  })

  const license: License = {
    tier: 'pro',
    status: 'active',
    activatedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    deviceId: 'device-1',
    keySha256: 'hash-abc',
    maxDevices: 3,
    signature: 'sig-abc',
  }

  it('devuelve null sin licencia almacenada', async () => {
    const { repo } = freshRepo()
    expect(await repo.get()).toBeNull()
  })

  it('persiste y recupera la licencia en la fila fija', async () => {
    const { repo } = freshRepo()
    await repo.set(license)
    expect(await repo.get()).toEqual(license)
  })

  it('sobrescribe la licencia existente (una sola fila)', async () => {
    const { repo, db } = freshRepo()
    await repo.set(license)
    await repo.set({ ...license, tier: 'enterprise', maxDevices: 10 })
    const stored = await repo.get()
    expect(stored).toMatchObject({ tier: 'enterprise', maxDevices: 10 })
    const row = db.prepare(`SELECT COUNT(*) AS n FROM licenses`).get() as { n: number }
    expect(row.n).toBe(1)
  })

  it('acepta valores nulos (licencia free)', async () => {
    const { repo } = freshRepo()
    await repo.set({
      tier: 'free',
      status: 'active',
      activatedAt: null,
      expiresAt: null,
      deviceId: null,
      keySha256: null,
      maxDevices: null,
      signature: null,
    })
    const stored = await repo.get()
    expect(stored?.tier).toBe('free')
    expect(stored?.deviceId).toBeNull()
  })

  it('clear elimina la licencia', async () => {
    const { repo } = freshRepo()
    await repo.set(license)
    await repo.clear()
    expect(await repo.get()).toBeNull()
  })
})
