import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  IndexingService,
  InMemoryEventBus,
  runMigrations,
  SqliteAiCacheRepository,
  SqliteAiUsageRepository,
  SqliteClassificationRepository,
  SqliteDatabase,
  SqliteDocumentRepository,
  SqliteOcrQueueRepository,
  SqliteSearchRepository,
  SqliteSettingsRepository,
} from '@documind/core'
import { ClassificationService, SettingsService, type defaultSettings } from '@documind/domain'
import { ExtractionService } from '@documind/document'

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'documind-'))
  const db = new SqliteDatabase(join(dir, 'test.db'))
  runMigrations(db)

  const bus = new InMemoryEventBus()
  const settingsService = new SettingsService(new SqliteSettingsRepository(db))
  const settings = await settingsService.get()
  const getSettings = (): ReturnType<typeof defaultSettings> => settings

  const documents = new SqliteDocumentRepository(db)
  const classifications = new SqliteClassificationRepository(db)
  const search = new SqliteSearchRepository(db)
  const cache = new SqliteAiCacheRepository(db)
  const usage = new SqliteAiUsageRepository(db)
  const ocrQueue = new SqliteOcrQueueRepository(db)

  const classifier = new ClassificationService({
    ai: null,
    documents,
    classifications,
    cache,
    usage,
    bus,
    settings: getSettings,
  })

  const indexing = new IndexingService({
    extraction: new ExtractionService(),
    documents,
    ocrQueue,
    classifier,
    ocrEngine: null,
    bus,
    settings: getSettings,
  })

  const txt = new TextEncoder().encode('Factura DocuMind a Acme S.A. por importe 1250 euros.')
  await indexing.indexFile({
    sourceId: null,
    path: join(dir, 'factura.txt'),
    filename: 'factura.txt',
    buffer: txt,
    mtimeMs: Date.now(),
  })

  const list = await documents.list({ limit: 100 })
  if (list.items.length !== 1) throw new Error('Se esperaba 1 documento')
  const doc = list.items[0]
  if (!doc) throw new Error('Se esperaba 1 documento')
  if (doc.status !== 'ready') throw new Error(`Status incorrecto: ${doc.status}`)

  const content = await documents.getContent(doc.id)
  if (!content?.includes('Acme')) throw new Error('Contenido no indexado')

  const results = await search.fullText('Acme OR factura', 10)
  if (results.length === 0) throw new Error('Búsqueda FTS5 no encontró resultados')
  console.log('FTS results:', results.map((r) => `${r.document.filename} (score ${r.score.toFixed(2)})`).join(', '))

  const stats = await documents.stats()
  console.log('stats:', JSON.stringify(stats))

  db.close()
  console.log('INDEX SMOKE OK')
}

main().catch((err) => {
  console.error('INDEX SMOKE FAIL', err)
  process.exit(1)
})
