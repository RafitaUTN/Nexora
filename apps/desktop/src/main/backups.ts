import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '@documind/core'

export interface BackupEntry {
  name: string
  createdAt: string
  sizeBytes: number
}

const MANIFEST = 'manifest.json'

/**
 * Copias de seguridad de la base de datos local. Cada backup es una carpeta
 * con los ficheros SQLite (db + WAL/SHM si existen) y un manifiesto.
 */
export class BackupManager {
  constructor(
    private readonly backupsDir: string,
    private readonly logger: Logger,
  ) {}

  async create(dbPath: string): Promise<BackupEntry> {
    mkdirSync(this.backupsDir, { recursive: true })
    const name = new Date().toISOString().replace(/[:.]/g, '-')
    const target = join(this.backupsDir, name)
    mkdirSync(target, { recursive: true })

    for (const suffix of ['', '-wal', '-shm']) {
      const src = `${dbPath}${suffix}`
      if (existsSync(src)) cpSync(src, join(target, `documind.db${suffix}`))
    }
    const manifest = {
      app: 'documind',
      createdAt: new Date().toISOString(),
      dbFile: 'documind.db',
    }
    writeFileSync(join(target, MANIFEST), JSON.stringify(manifest, null, 2))
    const entry = this.describe(name)
    this.logger.info('Backup creado', { name, sizeBytes: entry.sizeBytes })
    return entry
  }

  async list(): Promise<BackupEntry[]> {
    if (!existsSync(this.backupsDir)) return []
    return readdirSync(this.backupsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(this.backupsDir, e.name, MANIFEST)))
      .map((e) => this.describe(e.name))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async restore(name: string, targetDbPath: string): Promise<void> {
    const backupDir = join(this.backupsDir, name)
    if (!existsSync(join(backupDir, MANIFEST))) {
      throw new Error(`Backup no encontrado: ${name}`)
    }
    for (const suffix of ['', '-wal', '-shm']) {
      const src = join(backupDir, `documind.db${suffix}`)
      const dst = `${targetDbPath}${suffix}`
      if (existsSync(src)) cpSync(src, dst)
    }
    this.logger.info('Backup restaurado', { name })
  }

  private describe(name: string): BackupEntry {
    const dir = join(this.backupsDir, name)
    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8')) as { createdAt: string }
    const sizeBytes = readdirSync(dir)
      .filter((f) => f !== MANIFEST)
      .reduce((acc, f) => acc + statSync(join(dir, f)).size, 0)
    return { name, createdAt: manifest.createdAt, sizeBytes }
  }
}
