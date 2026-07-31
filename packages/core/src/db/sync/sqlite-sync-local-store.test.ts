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
        lastPullMs: 0,
      })
    })

    it('persiste y recupera la configuración', async () => {
      const { store } = fresh()
      await store.saveSettings({ enabled: true, url: 'https://x.supabase.co', anonKey: 'k', lastPullMs: 42 })
      expect(await store.getSettings()).toEqual({
        enabled: true,
        url: 'https://x.supabase.co',
        anonKey: 'k',
        lastPullMs: 42,
      })
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
      await store.markSynced(['tag:1'])
      expect(await store.pending()).toEqual([])
      const status = await store.status()
      expect(status.pending).toBe(0)
    })

    it('ignora claves inexistentes', async () => {
      const { store } = fresh()
      await store.markSynced(['tag:999'])
      expect(await store.pending()).toEqual([])
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

    it('aplica LWW: descarta cambios remotos más antiguos que el estado local', async () => {
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
      expect(result).toEqual({ applied: 0, skipped: 1 })
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
  })
})
