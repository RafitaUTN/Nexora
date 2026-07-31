export interface FileChange {
  path: string
  kind: 'add' | 'change' | 'unlink'
}

/**
 * Puerto watcher de carpetas. La implementación real usa chokidar en el
 * proceso principal; en tests se usa un fake.
 */
export interface FileWatcher {
  watch(root: string, recursive: boolean): Promise<void>
  unwatch(root: string): Promise<void>
  close(): void
  onChange(handler: (change: FileChange) => void): void
}
