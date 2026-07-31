import { describe, afterEach, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteDatabase } from './database'
import { runMigrations } from './migrations'
import { SqliteSettingsRepository } from './repositories/sqlite-settings-repository'
import { SqliteTagRepository } from './repositories/sqlite-tag-repository'
import { SqliteAuditRepository } from './repositories/sqlite-audit-repository'
import { SqliteAutomationRepository } from './repositories/sqlite-automation-repository'
import { SqliteDocumentRepository } from './repositories/sqlite-document-repository'
import { SqliteSearchRepository } from './repositories/sqlite-search-repository'
import { SqliteSourceRepository } from './repositories/sqlite-source-repository'
import { SqliteClassificationRepository } from './repositories/sqlite-classification-repository'
import { SqliteOcrQueueRepository } from './repositories/sqlite-ocr-queue-repository'
import { SqliteAiCacheRepository, SqliteAiUsageRepository } from './repositories/sqlite-ai-repositories'
import { SqliteSecretStore } from '../secrets/sqlite-secret-store'
import { AesGcm } from '../crypto/aes'

describe('integración SQLite', () => {
  const dbs: SqliteDatabase[] = []

  function freshDb(): SqliteDatabase {
    const dir = mkdtempSync(join(tmpdir(), 'documind-it-'))
    const db = new SqliteDatabase(join(dir, 'test.db'))
    runMigrations(db)
    dbs.push(db)
    return db
  }

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      db.checkpoint()
      db.close()
    }
  })

  it('aplica migraciones y crea las tablas esperadas', () => {
    const db = freshDb()
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
      name: string
    }[]
    const names = tables.map((t) => t.name)
    for (const table of [
      'documents',
      'tags',
      'secrets',
      'settings',
      'audit_log',
      'automations',
      'history',
      'licenses',
    ]) {
      expect(names).toContain(table)
    }
  })

  it('settings repo persiste y sobrescribe valores', async () => {
    const repo = new SqliteSettingsRepository(freshDb())
    expect(await repo.get('k')).toBeNull()
    await repo.set('k', 'v1')
    await repo.set('k', 'v2')
    expect(await repo.get('k')).toBe('v2')
  })

  it('tags repo: crear, encontrar por nombre, asignar y contar', async () => {
    const db = freshDb()
    const docs = new SqliteDocumentRepository(db)
    const tags = new SqliteTagRepository(db)
    const doc = await docs.save({
      sourceId: null,
      path: '/a.pdf',
      filename: 'a.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      hashSha256: 'hash-1',
      fileMtimeMs: null,
    })
    const tag = await tags.create({ name: 'factura', color: '#ff0000' })
    expect(await tags.findByName('factura')).toMatchObject({ name: 'factura' })
    await tags.assign(tag.id, doc.id)
    await tags.assign(tag.id, doc.id)
    const stats = await tags.listWithStats()
    expect(stats.find((s) => s.id === tag.id)?.count).toBe(1)
    expect(await tags.listByDocument(doc.id)).toHaveLength(1)
    await tags.unassign(tag.id, doc.id)
    expect(await tags.listByDocument(doc.id)).toHaveLength(0)
  })

  it('audit repo pagina de más reciente a más antiguo', async () => {
    const repo = new SqliteAuditRepository(freshDb())
    for (let i = 0; i < 3; i++) await repo.add({ action: `a${i}` })
    const page = await repo.list(2)
    expect(page.map((e) => e.action)).toEqual(['a2', 'a1'])
    const next = await repo.list(2, page[1]?.id)
    expect(next.map((e) => e.action)).toEqual(['a0'])
  })

  it('automation repo: crear, filtrar habilitadas, toggle y runs', async () => {
    const db = freshDb()
    const repo = new SqliteAutomationRepository(db)
    const docs = new SqliteDocumentRepository(db)
    const doc = await docs.save({
      sourceId: null,
      path: '/auto.pdf',
      filename: 'auto.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      hashSha256: 'hash-auto',
      fileMtimeMs: null,
    })
    const a = await repo.create({
      name: 'Etiquetar',
      enabled: true,
      triggerType: 'document:indexed',
      action: { type: 'tag', tagNames: ['nuevo'] },
    })
    await repo.create({
      name: 'Off',
      enabled: false,
      triggerType: 'document:indexed',
      action: { type: 'classify' },
    })
    expect(await repo.list(true)).toHaveLength(1)
    await repo.updateEnabled(a.id, false)
    expect(await repo.list(true)).toHaveLength(0)
    await repo.recordRun(a.id, doc.id, true, 'ok')
    await repo.delete(a.id)
    expect(await repo.list()).toHaveLength(1)
  })

  it('secret store cifra en disco y permite get/has/delete', async () => {
    const db = freshDb()
    const store = new SqliteSecretStore(db, new AesGcm('secreto-master-muy-largo-para-test'))
    expect(await store.has('openai')).toBe(false)
    await store.set('openai', 'sk-secret-value')
    expect(await store.has('openai')).toBe(true)
    expect(await store.get('openai')).toBe('sk-secret-value')
    const raw = db.prepare(`SELECT ciphertext FROM secrets WHERE kind = 'openai'`).get() as
      { ciphertext: Buffer } | undefined
    expect(Buffer.isBuffer(raw?.ciphertext)).toBe(true)
    expect(String(raw?.ciphertext ?? '')).not.toContain('sk-secret')
    await store.delete('openai')
    expect(await store.get('openai')).toBeNull()
  })

  it('document + search repo indexa contenido y busca con FTS', async () => {
    const db = freshDb()
    const docs = new SqliteDocumentRepository(db)
    const search = new SqliteSearchRepository(db)
    const doc = await docs.save({
      sourceId: null,
      path: '/factura.pdf',
      filename: 'factura.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      hashSha256: 'hash-factura',
      fileMtimeMs: null,
    })
    await docs.setContent(doc.id, 'Factura número 2024 por importe de 120 euros')
    await docs.updateContentPreview(doc.id, 'Factura 2024')
    await docs.updateStatus(doc.id, 'indexed')
    const hits = await search.fullText('factura', 10)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.document.filename).toBe('factura.pdf')
    const stats = await docs.stats()
    expect(stats.total).toBe(1)
  })

  it('search repo: tokens vacíos devuelven [] y filtros ext/tagId', async () => {
    const db = freshDb()
    const docs = new SqliteDocumentRepository(db)
    const tags = new SqliteTagRepository(db)
    const search = new SqliteSearchRepository(db)
    const doc = await docs.save({
      sourceId: null,
      path: '/filtro.pdf',
      filename: 'filtro.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      hashSha256: 'hash-filtro',
      fileMtimeMs: null,
    })
    await docs.setContent(doc.id, 'Contrato de arrendamiento 2025')
    const tag = await tags.create({ name: 'importante', color: '#00ff00' })
    await tags.assign(tag.id, doc.id)

    expect(await search.fullText('el la de', 10)).toEqual([])

    expect(await search.fullText('contrato', 10, { ext: 'pdf' })).toHaveLength(1)
    expect(await search.fullText('contrato', 10, { ext: 'docx' })).toHaveLength(0)
    expect(await search.fullText('contrato', 10, { tagId: tag.id })).toHaveLength(1)
    expect(await search.fullText('contrato', 10, { tagId: 999 })).toHaveLength(0)
  })

  it('source repo: listar, añadir, último scan y eliminar', async () => {
    const db = freshDb()
    const repo = new SqliteSourceRepository(db)
    expect(await repo.list()).toEqual([])

    const added = await repo.add({
      path: '/home/rafa/docs',
      name: 'docs',
      kind: 'folder',
      scanMode: 'recursive',
      enabled: true,
    })
    expect(added).toMatchObject({
      path: '/home/rafa/docs',
      name: 'docs',
      kind: 'folder',
      scanMode: 'recursive',
      enabled: true,
    })

    await repo.add({
      path: '/tmp/off',
      name: 'off',
      kind: 'file',
      scanMode: 'flat',
      enabled: false,
    })

    const list = await repo.list()
    expect(list.map((s) => s.name)).toEqual(['docs', 'off'])
    expect(list[1]?.enabled).toBe(false)

    await repo.setLastScan(added.id, '2026-07-31 10:00:00')
    expect((await repo.list()).find((s) => s.id === added.id)?.lastScanAt).toBe('2026-07-31 10:00:00')

    await repo.remove(added.id)
    expect(await repo.list()).toHaveLength(1)
  })

  it('classification repo: guardar, upsert y entidades', async () => {
    const db = freshDb()
    const docs = new SqliteDocumentRepository(db)
    const repo = new SqliteClassificationRepository(db)
    const doc = await docs.save({
      sourceId: null,
      path: '/class.pdf',
      filename: 'class.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      hashSha256: 'hash-class',
      fileMtimeMs: null,
    })

    expect(await repo.findByDocumentId(doc.id)).toBeNull()

    await repo.save({
      documentId: doc.id,
      category: 'factura',
      confidence: 0.9,
      provider: 'ollama',
      model: 'llama3',
      cached: false,
      createdAt: '2026-07-31 09:00:00',
    })
    expect(await repo.findByDocumentId(doc.id)).toMatchObject({ category: 'factura', confidence: 0.9 })

    await repo.save({
      documentId: doc.id,
      category: 'recibo',
      confidence: 0.5,
      provider: 'ollama',
      model: 'llama3',
      cached: true,
      createdAt: '2026-07-31 10:00:00',
    })
    expect(await repo.findByDocumentId(doc.id)).toMatchObject({ category: 'recibo', cached: true })

    await repo.saveEntities(doc.id, [
      { kind: 'amount', value: '120', confidence: 0.95 },
      { kind: 'date', value: '2024-01-01', confidence: 0.8 },
    ])
    expect(await repo.listEntities(doc.id)).toHaveLength(2)

    await repo.saveEntities(doc.id, [{ kind: 'email', value: 'a@b.es', confidence: 0.7 }])
    const entities = await repo.listEntities(doc.id)
    expect(entities).toHaveLength(1)
    expect(entities[0]).toMatchObject({ kind: 'email', value: 'a@b.es' })

    await repo.saveEntities(doc.id, [])
    expect(await repo.listEntities(doc.id)).toHaveLength(1)

    db.prepare('INSERT INTO entities (document_id, kind, value, confidence) VALUES (?, ?, ?, NULL)').run(
      doc.id,
      'iban',
      'ES123',
    )
    const nullConf = await repo.listEntities(doc.id)
    expect(nullConf.find((e) => e.kind === 'iban')).toMatchObject({ kind: 'iban', value: 'ES123', confidence: 0 })
  })

  it('ocr queue repo: encolar, batch por prioridad, estados y conteo', async () => {
    const db = freshDb()
    const docs = new SqliteDocumentRepository(db)
    const repo = new SqliteOcrQueueRepository(db)
    async function saveDoc(path: string, hash: string): Promise<number> {
      return (
        await docs.save({
          sourceId: null,
          path,
          filename: path,
          ext: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
          hashSha256: hash,
          fileMtimeMs: null,
        })
      ).id
    }

    const low = await saveDoc('/low.pdf', 'h-low')
    const high = await saveDoc('/high.pdf', 'h-high')
    await repo.enqueue(low)
    await repo.enqueue(low)
    await repo.enqueue(high, 10)
    expect(await repo.pendingCount()).toBe(2)

    const batch = await repo.nextBatch(1)
    expect(batch).toHaveLength(1)
    const highId = batch[0]?.id
    expect(highId).toBeDefined()
    if (highId === undefined) throw new Error('batch vacío')
    expect(batch[0]?.documentId).toBe(high)

    await repo.markProcessing(highId)
    expect(await repo.pendingCount()).toBe(2)

    const next = await repo.nextBatch(10)
    expect(next[0]?.documentId).toBe(low)
    const lowId = next[0]?.id
    expect(lowId).toBeDefined()
    if (lowId === undefined) throw new Error('batch vacío')

    await repo.markError(highId)
    await repo.markDone(lowId)
    expect(await repo.pendingCount()).toBe(0)
  })

  it('ai cache repo: miss, hit, upsert y expiración', async () => {
    const db = freshDb()
    const repo = new SqliteAiCacheRepository(db)
    expect(await repo.get('hash-1')).toBeNull()

    await repo.set('hash-1', 'respuesta')
    expect(await repo.get('hash-1')).toBe('respuesta')

    await repo.set('hash-1', 'nueva')
    expect(await repo.get('hash-1')).toBe('nueva')

    await repo.set('hash-2', 'caduca', 60)
    db.prepare(
      `UPDATE ai_cache SET expires_at = datetime('now', '-1 hour') WHERE request_hash = 'hash-2'`,
    ).run()
    expect(await repo.get('hash-2')).toBeNull()
  })

  it('ai usage repo: registrar y resumir', async () => {
    const repo = new SqliteAiUsageRepository(freshDb())
    expect(await repo.summarize()).toEqual({ totalCalls: 0, totalTokens: 0, totalCostUsd: 0, cachedHits: 0 })

    await repo.record({
      provider: 'openai',
      model: 'gpt-4o',
      task: 'classify',
      promptTokens: 100,
      completionTokens: 20,
      estCostUsd: 0.001,
      latencyMs: 500,
      cached: true,
    })
    await repo.record({
      provider: 'openai',
      model: 'gpt-4o',
      task: 'classify',
      promptTokens: 50,
      completionTokens: 10,
      estCostUsd: 0.0005,
      latencyMs: 300,
      cached: false,
    })

    expect(await repo.summarize()).toEqual({
      totalCalls: 2,
      totalTokens: 180,
      totalCostUsd: 0.0015,
      cachedHits: 1,
    })
  })

  it('document repo: duplicados, versiones, historial y borrado lógico', async () => {
    const db = freshDb()
    const docs = new SqliteDocumentRepository(db)
    const a = await docs.save({
      sourceId: null,
      path: '/v1.pdf',
      filename: 'v1.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      hashSha256: 'hash-v',
      fileMtimeMs: null,
    })
    await docs.save({
      sourceId: null,
      path: '/dup.pdf',
      filename: 'dup.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12,
      hashSha256: 'hash-v',
      fileMtimeMs: null,
    })
    expect(await docs.findByHash('hash-v')).toHaveLength(2)
    const byPath = await docs.findByPath(null, '/v1.pdf')
    expect(byPath?.id).toBe(a.id)
    await docs.setDuplicate(a.id, a.id)
    const list = await docs.list({})
    expect(list.items.some((d) => d.isDuplicateOf === a.id)).toBe(true)

    await docs.addHistory({ documentId: a.id, action: 'created' })
    await docs.addVersion(a.id, 2, '/v1.pdf', 'hash-v2', 15)
    expect(await docs.listHistory(a.id, 10)).toHaveLength(1)

    await docs.markDeleted(a.id)
    const afterDelete = await docs.list({})
    expect(afterDelete.items.find((d) => d.id === a.id)).toBeUndefined()
    expect((await docs.findById(a.id))?.deletedAt).not.toBeNull()
  })
})
