import { expect, test, _electron as electron } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const mainEntry = join(root, 'apps/desktop/out/main/index.js')
const electronPath = require('electron') as string

interface SourcesApi {
  add(input: {
    path: string
    name: string
    kind: 'folder'
    scanMode: 'recursive'
    enabled: boolean
  }): Promise<{ id: number }>
}

interface AuthApi {
  setup(input: { username: string; password: string; displayName: string; role: 'admin' }): Promise<unknown>
  login(username: string, password: string): Promise<unknown>
}

/** Credencial de la cuenta admin del test; configurable para evitar literales en el código. */
const E2E_PASSWORD = process.env['DOCUMIND_E2E_PASSWORD'] ?? 'E2E-password-123'

/** Crea una carpeta temporal con un documento de texto indexable. */
function makeFixture(): { dir: string; filename: string } {
  const dir = mkdtempSync(join(tmpdir(), 'documind-e2e-'))
  const filename = 'factura-e2e.txt'
  writeFileSync(join(dir, filename), 'Factura E2E número 998877 de la empresa Pruebas SA.', 'utf-8')
  return { dir, filename }
}

test('smoke: abrir la app, escanear una carpeta y buscar', async () => {
  const { dir, filename } = makeFixture()
  const userData = mkdtempSync(join(tmpdir(), 'documind-e2e-data-'))

  const app = await electron.launch({
    executablePath: electronPath,
    args: [mainEntry, '--disable-gpu', ...(process.env['CI'] ? ['--no-sandbox'] : [])],
    env: { ...process.env, DOCUMIND_USER_DATA: userData, DOCUMIND_SMOKE: '' },
    timeout: 120_000,
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  try {
    // FASE 10: primer arranque exige crear el admin y abrir sesión vía API.
    await page.waitForFunction(() => {
      const api = (window as unknown as { api: { auth: AuthApi } }).api
      return typeof api?.auth?.setup === 'function'
    })
    await page.evaluate(async (password) => {
      const auth = (window as unknown as { api: { auth: AuthApi } }).api.auth
      await auth.setup({ username: 'e2e', password, displayName: 'E2E', role: 'admin' })
      await auth.login('e2e', password)
    }, E2E_PASSWORD)
    await page.reload()

    // La app arranca en el Dashboard con la barra lateral visible.
    await expect(page.getByRole('link', { name: 'Documentos', exact: true })).toBeVisible({ timeout: 30_000 })

    // Fuentes: añadir la carpeta vía API (el diálogo nativo de selección no es automatizable).
    await page.getByRole('link', { name: 'Fuentes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Fuentes' })).toBeVisible()
    await page.evaluate(
      ({ path, name }) =>
        (window as unknown as { api: { sources: SourcesApi } }).api.sources.add({
          path,
          name,
          kind: 'folder',
          scanMode: 'recursive',
          enabled: true,
        }),
      { path: dir, name: 'E2E carpeta' },
    )
    await page.reload()

    const escanear = page.getByRole('button', { name: 'Escanear' })
    await expect(escanear).toBeVisible({ timeout: 15_000 })
    await escanear.click()

    await expect(page.getByText('Rescan completado')).toBeVisible({ timeout: 30_000 })

    // El documento indexado aparece en la lista.
    await page.getByRole('link', { name: 'Documentos', exact: true }).click()
    const docRow = page.locator('a[href^="#/documents/"]').filter({ hasText: filename })
    await expect(docRow).toBeVisible({ timeout: 30_000 })

    // Buscar por contenido devuelve la coincidencia.
    await page.getByPlaceholder('Buscar por contenido…').fill('998877')
    await expect(page.getByText(/coincidencia/)).toBeVisible({ timeout: 15_000 })
    await expect(docRow).toBeVisible()

    // Búsqueda global (Ctrl/Cmd+K): abre el overlay, busca el documento y navega a él.
    await page.keyboard.press('Control+k')
    const searchInput = page.getByPlaceholder('Buscar documentos, páginas y acciones…')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('998877')
    const hit = page.getByRole('option').filter({ hasText: filename }).first()
    await expect(hit).toBeVisible({ timeout: 15_000 })
    await hit.click()
    await expect(page.getByText(filename).first()).toBeVisible({ timeout: 15_000 })  } finally {
    await app.close()
  }
})

test('updates: mostrar el modal cuando hay una nueva versión disponible', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'documind-e2e-data-'))

  const app = await electron.launch({
    executablePath: electronPath,
    args: [mainEntry, '--disable-gpu', ...(process.env['CI'] ? ['--no-sandbox'] : [])],
    env: { ...process.env, DOCUMIND_USER_DATA: userData, DOCUMIND_SMOKE: '' },
    timeout: 120_000,
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  try {
    // Espera a que React haya montado (el modal suscribe al evento en el mount).
    await expect(page.getByRole('heading', { name: 'Bienvenido a DocuMind' })).toBeVisible({
      timeout: 30_000,
    })

    // Emula el evento del proceso principal: una actualización 9.9.9 disponible.
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.send('event:update:status', {
        status: 'available',
        currentVersion: '1.1.0',
        latestVersion: '9.9.9',
      })
    })
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Nueva versión 9.9.9 disponible')).toBeVisible()

    // «Más tarde» cierra el diálogo y no reaparece para la misma versión.
    await page.getByRole('button', { name: 'Más tarde' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.send('event:update:status', {
        status: 'available',
        currentVersion: '1.1.0',
        latestVersion: '9.9.9',
      })
    })
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 5_000 })
  } finally {
    await app.close()
  }
})
