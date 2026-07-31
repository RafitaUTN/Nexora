import { watch, type FSWatcher } from 'chokidar'
import type { FileChange, FileWatcher } from '@documind/domain'

/**
 * Implementación del puerto FileWatcher con chokidar. Mantiene un watcher
 * por carpeta raíz; ignora cambios iniciales (solo eventos posteriores).
 */
export class ChokidarFileWatcher implements FileWatcher {
  private readonly watchers = new Map<string, FSWatcher>()
  private handler?: (change: FileChange) => void

  async watch(root: string, recursive: boolean): Promise<void> {
    if (this.watchers.has(root)) return
    const watcher = watch(root, {
      persistent: true,
      ignoreInitial: true,
      depth: recursive ? undefined : 0,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      ignored: (path) => /(^|[\\/])\./.test(path),
    })
    watcher.on('add', (path) => this.handler?.({ path, kind: 'add' }))
    watcher.on('change', (path) => this.handler?.({ path, kind: 'change' }))
    watcher.on('unlink', (path) => this.handler?.({ path, kind: 'unlink' }))
    watcher.on('error', () => undefined)
    this.watchers.set(root, watcher)
    await new Promise<void>((resolve) => watcher.once('ready', () => resolve()))
  }

  async unwatch(root: string): Promise<void> {
    const watcher = this.watchers.get(root)
    if (!watcher) return
    this.watchers.delete(root)
    await watcher.close()
  }

  onChange(handler: (change: FileChange) => void): void {
    this.handler = handler
  }

  close(): void {
    for (const watcher of this.watchers.values()) {
      void watcher.close()
    }
    this.watchers.clear()
  }
}
