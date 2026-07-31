import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteDatabase } from '../database'
import { runMigrations } from '../migrations'
import { SqliteSyncLocalStore } from './sqlite-sync-local-store'
import type { SyncChange } from '@documind/domain'

describe('SqliteSyncLocalStore', () => {
  const dbs: SqliteDatabase[] = []

  function fresh(): { store: SqliteSyncLocalStore; db: SqliteDatabase } {
    const dir = mkdtempSync(join(tmpdir(), 'documind-sync-'))
    const db = new SqliteDatabase(join(dir, 'test.db'))
    runMigrations(db)
    dbs.push(db)
    return { store: new SqliteSyncLocalStore(db, 'device-1'), db }
  }

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      db.checkpoint()
      db.close()
    }
  })

  describe('settings', () => {
    it('devuelve valores por defecto sin configuración', async () => {
      const { store } = fresh()
      expect(await store.getSettings()).toEqual({
        enabled: false,
        url: '',
        anonKey: '',
        email: '',
        lastPullMs: 0,
      })
    })

    it('persiste y recupera la configuración', async () => {
      const { store } = fresh()
      await store.saveSettings({ enabled: true, url: 'https://x.supabase.co', anonKey: 'k', email: 'u@x.co', lastPullMs: 42 })
      expect(await store.getSettings()).toEqual({
        enabled: true,
        url: 'https://x.supabase.co',
        anonKey: 'k',
        email: 'u@x.co',
        lastPullMs: 42,
      })
    })

    it('expone email y autenticación en el estado', async () => {
      const { store } = fresh()
      expect((await store.status()).authenticated).toBe(false)
      expect((await store.status()).email).toBe('')
      await store.saveSettings({ enabled: true, url: 'https://x.supabase.co', anonKey: 'k', email: 'u@x.co', lastPullMs: 0 })
      const status = await store.status()
      expect(status.authenticated).toBe(true)
      expect(status.email).toBe('u@x.co')
    })
  })

  describe('pending', () => {
    it('no reporta cambios sin outbox', async () => {
      const { store } = fresh()
      expect(await store.pending()).toEqual([])
    })

    it('recoge cambios de documentos, tags y asignaciones por triggers', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256)
                  VALUES (NULL, '/a.pdf', 'a.pdf', 'pdf', 10, 'h1')`).run()
      db.prepare(`INSERT INTO tags (name, color) VALUES ('factura', '#f00')`).run()
      const docId = 1
      db.prepare(`INSERT INTO document_tags (document_id, tag_id) VALUES (1, 1)`).run()

      const pending = await store.pending()
      expect(pending.map((c) => c.entity).sort()).toEqual(['assignment', 'document', 'tag'])
      const doc = pending.find((c) => c.entity === 'document')
      expect(doc).toMatchObject({ entityKey: String(docId), op: 'upsert', deviceId: 'device-1' })
      expect(doc?.document).toMatchObject({ localId: docId, filename: 'a.pdf' })
      const tag = pending.find((c) => c.entity === 'tag')
      expect(tag?.tag).toMatchObject({ localId: 1, name: 'factura' })
      const assignment = pending.find((c) => c.entity === 'assignment')
      expect(assignment?.assignment).toEqual({ documentId: 1, tagId: 1 })
      expect(assignment?.entityKey).toBe('1:1')
    })

    it('marca delete para filas borradas', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO tags (name) VALUES ('temp')`).run()
      db.prepare(`DELETE FROM tags WHERE id = 1`).run()
      const pending = await store.pending()
      expect(pending).toHaveLength(1)
      expect(pending[0]).toMatchObject({ entity: 'tag', entityKey: '1', op: 'delete' })
    })

    it('incluye el contenido del documento', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256)
                  VALUES (NULL, '/b.pdf', 'b.pdf', 'pdf', 20, 'h2')`).run()
      db.prepare(`INSERT INTO document_contents (document_id, content, content_hash)
                  VALUES (1, 'texto extraído', 'ch2')`).run()
      const pending = await store.pending()
      expect(pending[0]?.document?.content).toBe('texto extraído')
      expect(pending[0]?.document?.contentHash).toBe('ch2')
    })
  })

  describe('markSynced', () => {
    it('marca como sincronizados los cambios pendientes', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO tags (name) VALUES ('t1')`).run()
      expect((await store.pending()).length).toBe(1)
      const pending = await store.pending()
      await store.markSynced(pending)
      expect(await store.pending()).toEqual([])
      const status = await store.status()
      expect(status.pending).toBe(0)
    })

    it('ignora cambios sin fila subyacente', async () => {
      const { store } = fresh()
      await store.markSynced([
        {
          entity: 'tag',
          entityKey: '999',
          op: 'upsert',
          updatedAtMs: 1000,
          deviceId: 'device-1',
          tag: { localId: 999, name: 'fantasma', color: null, createdAt: null },
        },
      ])
      expect(await store.pending()).toEqual([])
    })

    it('guarda el payload subido como línea base por clave', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO tags (name) VALUES ('t1')`).run()
      const pending = await store.pending()
      await store.markSynced(pending)
      const row = db.prepare(`SELECT payload FROM sync_last_payload WHERE entity = 'tag'`).get() as {
        payload: string
      }
      expect(JSON.parse(row.payload)).toMatchObject({ entity: 'tag', entityKey: '1' })
    })
  })

  describe('applyRemote', () => {
    it('inserta un documento remoto y lo mapea en sync_meta', async () => {
      const { store, db } = fresh()
      const change: SyncChange = {
        entity: 'document',
        entityKey: '100',
        op: 'upsert',
        updatedAtMs: 1000,
        deviceId: 'device-2',
        document: {
          localId: 100,
          filename: 'remoto.pdf',
          ext: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 99,
          hashSha256: 'h-remote',
          status: 'indexed',
          title: 'Remoto',
          contentPreview: 'preview',
          ocrConfidence: null,
          language: 'es',
          version: 1,
          addedAt: '2026-01-01T00:00:00.000Z',
          content: 'contenido remoto',
          contentHash: 'ch-remote',
        },
      }
      const result = await store.applyRemote([change])
      expect(result).toEqual({ applied: 1, skipped: 0 })
      const row = db.prepare(`SELECT filename, title FROM documents WHERE id = ?`).get(100) as {
        filename: string
        title: string
      }
      expect(row.filename).toBe('remoto.pdf')
      expect(row.title).toBe('Remoto')
      const content = db.prepare(`SELECT content FROM document_contents WHERE document_id = 100`).get() as {
        content: string
      }
      expect(content.content).toBe('contenido remoto')
      expect(await store.pending()).toEqual([])
    })

    it('fusiona por campos: un cambio remoto antiguo no pisa el estado local', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256)
                  VALUES (NULL, '/x.pdf', 'x.pdf', 'pdf', 10, 'hx')`).run()
      const change: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 1,
        deviceId: 'device-2',
        document: {
          localId: 1,
          filename: 'x.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 10,
          hashSha256: 'hx',
          status: 'pending',
          title: 'obsoleto',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      const result = await store.applyRemote([change])
      expect(result).toEqual({ applied: 1, skipped: 0 })
      const row = db.prepare(`SELECT title FROM documents WHERE id = 1`).get() as { title: string }
      expect(row.title).toBeNull()
    })

    it('aplica cambios remotos con timestamp posterior', async () => {
      const { store, db } = fresh()
      const change: SyncChange = {
        entity: 'document',
        entityKey: '7',
        op: 'upsert',
        updatedAtMs: 5000,
        deviceId: 'device-2',
        document: {
          localId: 7,
          filename: 'nuevo.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 5,
          hashSha256: 'hn',
          status: 'indexed',
          title: 'Nuevo',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.applyRemote([change])
      const doc = change.document
      if (!doc) throw new Error('esperado payload de documento')
      await store.applyRemote([
        { ...change, updatedAtMs: 6000, document: { ...doc, title: 'Actualizado' } },
      ])
      const row = db.prepare(`SELECT title FROM documents WHERE id = 7`).get() as { title: string }
      expect(row.title).toBe('Actualizado')
      const count = db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }
      expect(count.n).toBe(1)
    })

    it('aplica tombstones de documento (delete)', async () => {
      const { store, db } = fresh()
      const upsert: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 100,
        deviceId: 'device-2',
        document: {
          localId: 1,
          filename: 'd.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 10,
          hashSha256: 'hd',
          status: 'indexed',
          title: 'D',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.applyRemote([upsert])
      const change: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'delete',
        updatedAtMs: 9000,
        deviceId: 'device-2',
      }
      await store.applyRemote([change])
      const row = db.prepare(`SELECT deleted_at FROM documents WHERE id = 1`).get() as {
        deleted_at: string | null
      }
      expect(row.deleted_at).not.toBeNull()
    })

    it('mapea tags remotos y reusa el id local en la segunda aplicación', async () => {
      const { store, db } = fresh()
      const change: SyncChange = {
        entity: 'tag',
        entityKey: '55',
        op: 'upsert',
        updatedAtMs: 100,
        deviceId: 'device-2',
        tag: { localId: 55, name: 'impuestos', color: '#00f', createdAt: '2026-01-01T00:00:00.000Z' },
      }
      await store.applyRemote([change])
      const row = db.prepare(`SELECT id, name FROM tags WHERE name = 'impuestos'`).get() as {
        id: number
        name: string
      }
      expect(row.id).toBe(55)
      const tag = change.tag
      if (!tag) throw new Error('esperado payload de tag')
      await store.applyRemote([
        { ...change, updatedAtMs: 200, tag: { ...tag, name: 'impuestos-2' } },
      ])
      const updated = db.prepare(`SELECT id, name FROM tags WHERE name = 'impuestos-2'`).get() as {
        id: number
        name: string
      }
      expect(updated.id).toBe(55)
    })

    it('aplica asignaciones mapeando documento y tag', async () => {
      const { store, db } = fresh()
      await store.applyRemote([
        {
          entity: 'document',
          entityKey: '100',
          op: 'upsert',
          updatedAtMs: 1000,
          deviceId: 'device-2',
          document: {
            localId: 100,
            filename: 'a.pdf',
            ext: 'pdf',
            mimeType: null,
            sizeBytes: 1,
            hashSha256: 'h1',
            status: 'indexed',
            title: null,
            contentPreview: null,
            ocrConfidence: null,
            language: null,
            version: 1,
            addedAt: null,
            content: null,
            contentHash: null,
          },
        },
        {
          entity: 'tag',
          entityKey: '5',
          op: 'upsert',
          updatedAtMs: 1000,
          deviceId: 'device-2',
          tag: { localId: 5, name: 'etiqueta', color: null, createdAt: null },
        },
        {
          entity: 'assignment',
          entityKey: '100:5',
          op: 'upsert',
          updatedAtMs: 1000,
          deviceId: 'device-2',
          assignment: { documentId: 100, tagId: 5 },
        },
      ])
      const row = db.prepare(`SELECT document_id, tag_id FROM document_tags`).get() as {
        document_id: number
        tag_id: number
      }
      expect(row.document_id).toBe(100)
      expect(row.tag_id).toBe(5)
    })

    it('marca como compartidos los documentos de otro propietario', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'documind-sync-shared-'))
      const db = new SqliteDatabase(join(dir, 'test.db'))
      runMigrations(db)
      dbs.push(db)
      const store = new SqliteSyncLocalStore(db, 'device-1', async () => 'user-yo')
      const base = {
        entity: 'document' as const,
        op: 'upsert' as const,
        updatedAtMs: 2000,
        deviceId: 'device-2',
        document: {
          localId: 9,
          filename: 'compartido.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 1,
          hashSha256: 'h9',
          status: 'indexed' as const,
          title: null,
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.applyRemote([
        { ...base, entityKey: '9', ownerUserId: 'user-otro' },
        {
          ...base,
          entityKey: '10',
          ownerUserId: 'user-yo',
          document: { ...base.document, localId: 10, filename: 'propio.pdf', hashSha256: 'h10' },
        },
      ])
      const rows = db
        .prepare(`SELECT filename, shared FROM documents ORDER BY id`)
        .all() as { filename: string; shared: number }[]
      expect(rows).toHaveLength(2)
      expect(rows.find((r) => r.filename === 'compartido.pdf')?.shared).toBe(1)
      expect(rows.find((r) => r.filename === 'propio.pdf')?.shared).toBe(0)
    })

    it('fusiona por campos cuando cada lado edita campos distintos', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256, title)
                  VALUES (NULL, '/a.pdf', 'a.pdf', 'pdf', 1, 'h1', 'original')`).run()
      const baseline: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 1000,
        deviceId: 'device-1',
        document: {
          localId: 1,
          filename: 'a.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 1,
          hashSha256: 'h1',
          status: 'indexed',
          title: 'original',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.markSynced([baseline])
      db.prepare(`UPDATE documents SET title = 'local title', updated_at = datetime('now') WHERE id = 1`).run()
      const remote: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 2000,
        deviceId: 'device-2',
        document: {
          localId: 1,
          filename: 'b.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 1,
          hashSha256: 'h1',
          status: 'indexed',
          title: 'original',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      const result = await store.applyRemote([remote])
      expect(result).toEqual({ applied: 1, skipped: 0 })
      const row = db.prepare(`SELECT filename, title FROM documents WHERE id = 1`).get() as {
        filename: string
        title: string | null
      }
      expect(row.filename).toBe('b.pdf')
      expect(row.title).toBe('local title')
    })

    it('en conflicto del mismo campo gana el lado con timestamp más reciente', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256, title)
                  VALUES (NULL, '/a.pdf', 'a.pdf', 'pdf', 1, 'h1', 'original')`).run()
      const baseline: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 1000,
        deviceId: 'device-1',
        document: {
          localId: 1,
          filename: 'a.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 1,
          hashSha256: 'h1',
          status: 'indexed',
          title: 'original',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.markSynced([baseline])
      db.prepare(`UPDATE documents SET title = 'local edit', updated_at = datetime('now') WHERE id = 1`).run()
      db.prepare(
        `UPDATE sync_outbox SET updated_at_ms = 5000 WHERE entity = 'document' AND entity_key = '1'`,
      ).run()
      const remote: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 6000,
        deviceId: 'device-2',
        document: {
          localId: 1,
          filename: 'a.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 1,
          hashSha256: 'h1',
          status: 'indexed',
          title: 'remote edit',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.applyRemote([remote])
      const row = db.prepare(`SELECT title FROM documents WHERE id = 1`).get() as { title: string | null }
      expect(row.title).toBe('remote edit')
    })

    it('deja el merge pendiente para propagarlo en el siguiente ciclo', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256, title)
                  VALUES (NULL, '/a.pdf', 'a.pdf', 'pdf', 1, 'h1', 'original')`).run()
      const baseline: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 1000,
        deviceId: 'device-1',
        document: {
          localId: 1,
          filename: 'a.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 1,
          hashSha256: 'h1',
          status: 'indexed',
          title: 'original',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.markSynced([baseline])
      db.prepare(`UPDATE documents SET title = 'local edit', updated_at = datetime('now') WHERE id = 1`).run()
      const remote: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 6000,
        deviceId: 'device-2',
        document: {
          localId: 1,
          filename: 'b.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 1,
          hashSha256: 'h1',
          status: 'indexed',
          title: 'original',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.applyRemote([remote])
      const pending = await store.pending()
      expect(pending).toHaveLength(1)
      expect(pending[0]?.document?.title).toBe('local edit')
      expect(pending[0]?.document?.filename).toBe('b.pdf')
    })

    it('aplica cambios de share entrantes', async () => {
      const { store, db } = fresh()
      await store.applyRemote([
        {
          entity: 'share',
          entityKey: 'uid-1',
          op: 'upsert',
          updatedAtMs: 1000,
          deviceId: 'device-2',
          ownerUserId: 'user-otro',
          share: {
            localId: 0,
            uid: 'uid-1',
            ownerEmail: 'owner@example.com',
            memberEmail: 'yo@example.com',
            role: 'viewer',
            status: 'invited',
            createdAt: null,
          },
        },
      ])
      const row = db.prepare(`SELECT uid, status FROM shares WHERE uid = 'uid-1'`).get() as {
        uid: string
        status: string
      }
      expect(row.status).toBe('invited')
    })

    it('actualiza un share existente y aplica tombstones de share', async () => {
      const { store, db } = fresh()
      const upsert: SyncChange = {
        entity: 'share',
        entityKey: 'uid-1',
        op: 'upsert',
        updatedAtMs: 1000,
        deviceId: 'device-2',
        share: {
          localId: 0,
          uid: 'uid-1',
          ownerEmail: 'owner@example.com',
          memberEmail: 'yo@example.com',
          role: 'viewer',
          status: 'invited',
          createdAt: null,
        },
      }
      await store.applyRemote([upsert])
      const share = upsert.share
      if (!share) throw new Error('esperado payload de share')
      await store.applyRemote([{ ...upsert, updatedAtMs: 2000, share: { ...share, status: 'active' } }])
      const row = db.prepare(`SELECT status FROM shares WHERE uid = 'uid-1'`).get() as { status: string }
      expect(row.status).toBe('active')
      const count = db.prepare(`SELECT COUNT(*) AS n FROM shares WHERE uid = 'uid-1'`).get() as { n: number }
      expect(count.n).toBe(1)
      const tombstone: SyncChange = {
        entity: 'share',
        entityKey: 'uid-1',
        op: 'delete',
        updatedAtMs: 3000,
        deviceId: 'device-2',
      }
      await store.applyRemote([tombstone])
      const after = db.prepare(`SELECT COUNT(*) AS n FROM shares WHERE uid = 'uid-1'`).get() as { n: number }
      expect(after.n).toBe(0)
    })

    it('no fusiona cuando el pendiente local es un delete', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256)
                  VALUES (NULL, '/x.pdf', 'x.pdf', 'pdf', 10, 'hx')`).run()
      db.prepare(`UPDATE sync_outbox SET op = 'delete' WHERE entity = 'document' AND entity_key = '1'`).run()
      const remote: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 6000,
        deviceId: 'device-2',
        document: {
          localId: 1,
          filename: 'remoto.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 10,
          hashSha256: 'hx',
          status: 'indexed',
          title: null,
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      const result = await store.applyRemote([remote])
      expect(result).toEqual({ applied: 0, skipped: 1 })
      const row = db.prepare(`SELECT filename FROM documents WHERE id = 1`).get() as { filename: string }
      expect(row.filename).toBe('x.pdf')
    })

    it('no fusiona sin fila subyacente local', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256)
                  VALUES (NULL, '/x.pdf', 'x.pdf', 'pdf', 10, 'hx')`).run()
      db.prepare(`UPDATE documents SET deleted_at = datetime('now') WHERE id = 1`).run()
      const remote: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 6000,
        deviceId: 'device-2',
        document: {
          localId: 1,
          filename: 'remoto.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 10,
          hashSha256: 'hx',
          status: 'indexed',
          title: null,
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      const result = await store.applyRemote([remote])
      expect(result).toEqual({ applied: 0, skipped: 1 })
      const row = db.prepare(`SELECT deleted_at FROM documents WHERE id = 1`).get() as {
        deleted_at: string | null
      }
      expect(row.deleted_at).not.toBeNull()
    })

    it('fusiona tomando la línea base corrupta como inexistente', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256, title)
                  VALUES (NULL, '/a.pdf', 'a.pdf', 'pdf', 1, 'h1', 'original')`).run()
      db.prepare(
        `INSERT INTO sync_last_payload (entity, entity_key, payload, updated_at_ms)
         VALUES ('document', '1', '{no-json', 1000)`,
      ).run()
      db.prepare(`UPDATE documents SET title = 'local edit', updated_at = datetime('now') WHERE id = 1`).run()
      db.prepare(`UPDATE sync_outbox SET updated_at_ms = 2000 WHERE entity = 'document' AND entity_key = '1'`).run()
      const remote: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 5000,
        deviceId: 'device-2',
        document: {
          localId: 1,
          filename: 'b.pdf',
          ext: 'pdf',
          mimeType: null,
          sizeBytes: 1,
          hashSha256: 'h1',
          status: 'indexed',
          title: 'original',
          contentPreview: null,
          ocrConfidence: null,
          language: null,
          version: 1,
          addedAt: null,
          content: null,
          contentHash: null,
        },
      }
      await store.applyRemote([remote])
      const row = db.prepare(`SELECT filename, title FROM documents WHERE id = 1`).get() as {
        filename: string
        title: string | null
      }
      expect(row.filename).toBe('b.pdf')
      expect(row.title).toBe('original')
    })

    it('no fusiona un upsert sin payload de documento', async () => {
      const { store, db } = fresh()
      db.prepare(`INSERT INTO documents (source_id, path, filename, ext, size_bytes, hash_sha256)
                  VALUES (NULL, '/x.pdf', 'x.pdf', 'pdf', 10, 'hx')`).run()
      db.prepare(`UPDATE sync_outbox SET updated_at_ms = 500 WHERE entity = 'document' AND entity_key = '1'`).run()
      const change: SyncChange = {
        entity: 'document',
        entityKey: '1',
        op: 'upsert',
        updatedAtMs: 1000,
        deviceId: 'device-2',
      }
      const result = await store.applyRemote([change])
      expect(result).toEqual({ applied: 1, skipped: 0 })
      const row = db.prepare(`SELECT filename FROM documents WHERE id = 1`).get() as { filename: string }
      expect(row.filename).toBe('x.pdf')
    })
  })
})
