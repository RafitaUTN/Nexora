import { describe, afterEach, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteDatabase } from '../database'
import { runMigrations } from '../migrations'
import { SqliteShareRepository } from './sqlite-share-repository'

describe('SqliteShareRepository', () => {
  const dbs: SqliteDatabase[] = []

  function freshRepo(): { repo: SqliteShareRepository; db: SqliteDatabase } {
    const dir = mkdtempSync(join(tmpdir(), 'documind-share-'))
    const db = new SqliteDatabase(join(dir, 'test.db'))
    runMigrations(db)
    dbs.push(db)
    return { repo: new SqliteShareRepository(db), db }
  }

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      db.checkpoint()
      db.close()
    }
  })

  it('crea una compartición y la lista por propietario y miembro', async () => {
    const { repo } = freshRepo()
    const share = await repo.create({
      ownerEmail: 'owner@example.com',
      memberEmail: 'member@example.com',
      role: 'viewer',
      uid: 'uid-1',
    })
    expect(share.status).toBe('invited')
    const byOwner = await repo.listByOwner('OWNER@example.com')
    const byMember = await repo.listByMember('member@example.com')
    expect(byOwner).toHaveLength(1)
    expect(byMember).toHaveLength(1)
    expect(byOwner[0]?.uid).toBe('uid-1')
  })

  it('actualiza estado y rol', async () => {
    const { repo } = freshRepo()
    await repo.create({ ownerEmail: 'a@b.com', memberEmail: 'c@d.com', role: 'viewer', uid: 'u1' })
    const active = await repo.updateStatus('u1', 'active')
    expect(active?.status).toBe('active')
    const editor = await repo.updateRole('u1', 'editor')
    expect(editor?.role).toBe('editor')
  })

  it('devuelve null para claves inexistentes', async () => {
    const { repo } = freshRepo()
    expect(await repo.findByUid('no-existe')).toBeNull()
    expect(await repo.updateStatus('no-existe', 'active')).toBeNull()
  })

  it('elimina una compartición', async () => {
    const { repo } = freshRepo()
    await repo.create({ ownerEmail: 'a@b.com', memberEmail: 'c@d.com', role: 'viewer', uid: 'u1' })
    await repo.remove('u1')
    expect(await repo.findByUid('u1')).toBeNull()
  })

  it('el trigger rellena el outbox de sync al insertar y actualizar', async () => {
    const { repo, db } = freshRepo()
    await repo.create({ ownerEmail: 'a@b.com', memberEmail: 'c@d.com', role: 'viewer', uid: 'sync-uid' })
    const inserted = db
      .prepare(`SELECT entity, entity_key, op, synced FROM sync_outbox WHERE entity = 'share'`)
      .all() as { entity: string; entity_key: string; op: string; synced: number }[]
    expect(inserted).toEqual([
      { entity: 'share', entity_key: 'sync-uid', op: 'upsert', synced: 0 },
    ])
    await repo.updateStatus('sync-uid', 'active')
    const updated = db
      .prepare(`SELECT entity, entity_key, op, synced FROM sync_outbox WHERE entity = 'share'`)
      .all() as { entity: string; entity_key: string; op: string; synced: number }[]
    expect(updated).toEqual([
      { entity: 'share', entity_key: 'sync-uid', op: 'upsert', synced: 0 },
    ])
  })
})
