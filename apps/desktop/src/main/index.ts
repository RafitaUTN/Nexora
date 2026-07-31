import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, safeStorage } from 'electron'
import { randomHex } from '@documind/core'
import { ConsoleLogger } from '@documind/core'
import { createRuntime, type AppRuntime } from './runtime'
import { registerIpc, wireEvents, type IpcContext } from './ipc'
import { createMainWindow } from './window'

let mainWindow: BrowserWindow | null = null
let runtime: AppRuntime | null = null
let unsubscribeEvents: (() => void) | null = null

/** Secreto maestro cifrado con safeStorage (fallback a fichero plano en dev). */
function loadMasterSecret(): string {
  const keyFile = join(app.getPath('userData'), 'master.key')
  if (existsSync(keyFile)) {
    const raw = readFileSync(keyFile)
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(raw)
      } catch {
        // Blob corrupto o de otra máquina: regenerar.
      }
    } else {
      return raw.toString('utf8')
    }
  }
  const secret = randomHex(32)
  mkdirSync(app.getPath('userData'), { recursive: true })
  const blob = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(secret)
    : Buffer.from(secret, 'utf8')
  writeFileSync(keyFile, blob, { mode: 0o600 })
  return secret
}

const context: IpcContext = {
  getRuntime(): AppRuntime {
    if (!runtime) throw new Error('Runtime no inicializado')
    return runtime
  },
  async rebuildRuntime(): Promise<AppRuntime> {
    await runtime?.dispose()
    runtime = await createRuntime({
      userDataPath: app.getPath('userData'),
      masterSecret: loadMasterSecret(),
      logger: new ConsoleLogger('info'),
    })
    unsubscribeEvents?.()
    unsubscribeEvents = wireEvents(runtime.bus, () => mainWindow)
    return runtime
  },
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })

  app.on('before-quit', () => {
    void runtime?.dispose().catch(() => undefined)
  })

  void app.whenReady().then(async () => {
    try {
      app.setAppUserModelId('com.documind.desktop')
      console.log('[documind] userData=' + app.getPath('userData'))
      runtime = await createRuntime({
        userDataPath: app.getPath('userData'),
        masterSecret: loadMasterSecret(),
        logger: new ConsoleLogger('info'),
      })
      if (process.env['DOCUMIND_SMOKE'] === '1') {
        const settings = await runtime.settingsService.get()
        const provider = await runtime.getProvider()
        console.log(`ELECTRON_SMOKE_OK settings.ai=${settings.ai.provider} provider=${provider?.id ?? 'none'}`)
        await runtime.dispose()
        app.quit()
        return
      }
      registerIpc(context)
      unsubscribeEvents = wireEvents(runtime.bus, () => mainWindow)
      mainWindow = createMainWindow()
    } catch (error) {
      console.error('[documind] arranque fallido:', error)
      app.exit(1)
    }
  })
}
