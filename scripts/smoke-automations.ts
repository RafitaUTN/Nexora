import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FileChange, FileWatcher } from '@documind/domain'
import { createRuntime, masterSecretOf } from '../apps/desktop/src/main/runtime'
import { ConsoleLogger } from '@documind/core'

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
  const dir = mkdtempSync(join(tmpdir(), 'documind-automation-'))
  const runtime = await createRuntime({
    userDataPath: dir,
    masterSecret: masterSecretOf(dir),
    logger: new ConsoleLogger('error'),
    fileWatcher: new NullWatcher(),
    ocrEngine: null,
  })

  // Crear automatización ANTES de indexar: al indexar un documento, etiquetarlo.
  const created = await runtime.automationService.create({
    name: 'Etiquetar facturas',
    enabled: true,
    triggerType: 'document:indexed',
    action: { type: 'tag', tagNames: ['factura', 'automatico'] },
  })
  if (created.id <= 0) throw new Error('create no devolvió id')

  const listed = await runtime.automationService.list()
  if (listed.length !== 1 || listed[0]?.enabled !== true) throw new Error('list incorrecta')

  const txtPath = join(dir, 'factura.txt')
  await import('node:fs/promises').then((fs) => fs.writeFile(txtPath, 'Factura DocuMind a Acme por 99 euros.'))
  const ok = await runtime.scanPath(txtPath, 'factura.txt', null)
  if (!ok) throw new Error('scanPath no indexó el archivo')

  // Esperar a que el evento asíncrono dispare la automatización
  await new Promise((r) => setTimeout(r, 300))

  const docs = await runtime.documentService.list({ limit: 10 })
  const doc = docs.items[0]
  if (!doc) throw new Error('Sin documentos')
  const docTags = await runtime.repos.tags.listByDocument(doc.id)
  const tagNames = docTags.map((t) => t.name) ?? []
  if (!tagNames.includes('factura') || !tagNames.includes('automatico')) {
    throw new Error(`La automatización no etiquetó: ${tagNames.join(', ')}`)
  }

  // Historial del documento
  const history = await runtime.repos.documents.listHistory(doc.id, 50)
  if (history.length === 0) throw new Error('Historial de documento vacío')
  const actions = history.map((h) => h.action)
  if (!actions.includes('created') && !actions.includes('indexed')) throw new Error(`Historial raro: ${actions}`)

  // Auditoría registrada
  const audit = await runtime.auditService.list(50)
  if (audit.length === 0) throw new Error('Auditoría vacía')
  const auditActions = new Set(audit.map((a) => a.action))
  if (!auditActions.has('automation.run') && !auditActions.has('tag.assign')) {
    throw new Error(`Auditoría sin acciones esperadas: ${[...auditActions].join(', ')}`)
  }

  // toggle + remove
  await runtime.automationService.setEnabled(created.id, false)
  const afterToggle = await runtime.automationService.list()
  if (afterToggle[0]?.enabled !== false) throw new Error('setEnabled no aplicó')
  await runtime.automationService.remove(created.id)
  const afterRemove = await runtime.automationService.list()
  if (afterRemove.length !== 0) throw new Error('remove no eliminó')

  console.log('AUTOMATION SMOKE OK')
  console.log('history:', actions.join(', '))
  console.log('audit:', [...auditActions].join(', '))
  await runtime.dispose()
}

main().catch((error) => {
  console.error('AUTOMATION SMOKE FAIL', error)
  process.exit(1)
})
