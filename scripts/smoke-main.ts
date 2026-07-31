import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FileChange, FileWatcher } from '@documind/domain'
import { createRuntime, masterSecretOf } from '../apps/desktop/src/main/runtime'
import { ConsoleLogger } from '@documind/core'

/** Watcher fake: no observa nada pero captura los eventos si se emiten. */
class NullWatcher implements FileWatcher {
  changes: FileChange[] = []
  private handler?: (change: FileChange) => void
  async watch(): Promise<void> {}
  async unwatch(): Promise<void> {}
  close(): void {}
  onChange(handler: (change: FileChange) => void): void {
    this.handler = handler
  }
  emit(change: FileChange): void {
    this.handler?.(change)
  }
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'documind-main-'))
  const runtime = await createRuntime({
    userDataPath: dir,
    masterSecret: masterSecretOf(dir),
    logger: new ConsoleLogger('info'),
    fileWatcher: new NullWatcher(),
    ocrEngine: null,
  })

  // Settings por defecto
  const settings = await runtime.settingsService.get()
  if (settings.ai.provider !== null) throw new Error('Settings IA por defecto incorrectas')

  // Indexar un TXT vía scanPath
  const txtPath = join(dir, 'factura.txt')
  await import('node:fs/promises').then((fs) => fs.writeFile(txtPath, 'Factura DocuMind a Acme por 99 euros.'))
  const ok = await runtime.scanPath(txtPath, 'factura.txt', null)
  if (!ok) throw new Error('scanPath no indexó el archivo')

  const list = await runtime.documentService.list({ limit: 10 })
  if (list.items.length !== 1) throw new Error(`Se esperaba 1 documento, hay ${list.items.length}`)
  if (list.items[0]?.status !== 'ready') throw new Error('Status no es ready')

  // FTS
  const hits = await runtime.searchService.fullText('Acme factura', 10)
  if (hits.items.length !== 1) throw new Error('Búsqueda FTS falló en runtime')

  // Fuentes: añadir, escanear, listar
  const source = await runtime.repos.sources.add({
    path: dir,
    name: 'Mis documentos',
    kind: 'folder',
    scanMode: 'flat',
    enabled: true,
  })
  const scan = await runtime.scanSource(source.id)
  if (scan.indexed < 1) throw new Error('Escaneo no indexó documentos')

  // Backup + restore
  const backup = await runtime.backups.create(join(dir, 'documind.db'))
  if (backup.sizeBytes <= 0) throw new Error('Backup vacío')
  const backups = await runtime.backups.list()
  if (backups.length !== 1) throw new Error('No se listó el backup')
  const before = (await runtime.documentService.stats()).total
  await runtime.restoreBackup(backup.name)
  const runtime2 = await createRuntime({
    userDataPath: dir,
    masterSecret: masterSecretOf(dir),
    logger: new ConsoleLogger('info'),
    fileWatcher: new NullWatcher(),
    ocrEngine: null,
  })
  const restored = await runtime2.documentService.stats()
  if (restored.total !== before) throw new Error(`Restore perdió datos: ${restored.total} != ${before}`)

  await runtime2.dispose()
  console.log('MAIN SMOKE OK')
}

main().catch((error) => {
  console.error('MAIN SMOKE FAIL', error)
  process.exit(1)
})
