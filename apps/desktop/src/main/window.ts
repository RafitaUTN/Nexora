import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, session } from 'electron'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const isDev = !!process.env['ELECTRON_RENDERER_URL']

/** Política de seguridad de contenido: solo recursos locales y dev server. */
const CSP = [
  "default-src 'self'",
  // En dev Vite inyecta scripts inline (preamble de @vitejs/plugin-react); en producción el build no lleva inline.
  isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " http://localhost:* ws://localhost:*" : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

/**
 * Ventana principal con configuración segura por defecto:
 * contextIsolation, sandbox, sin nodeIntegration y CSP.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'DocuMind',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.on('page-title-updated', (event) => event.preventDefault())

  // CSP para respuestas HTTP (dev server).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    })
  })

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
