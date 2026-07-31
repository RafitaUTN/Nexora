# Changelog

Todas las versiones notables de DocuMind Desktop se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versionado semántico.

## [No publicado]

### Añadido
- FASE 13: sincronización entre dispositivos con Supabase/Postgres (ADR-0013). `SyncService` (dominio) con política LWW por `updatedAtMs`, `sync()` idempotente (sube pendientes, trae cambios de otros dispositivos, aplica y avanza `lastPullMs`), `ping`, `status`, `setEnabled` y `configure(url, anonKey)`. Migración 007 `sync_outbox`: tablas `sync_outbox` (PK `(entity, entity_key)`) y `sync_meta` (mapeo device_id/local_id) + triggers AFTER INSERT/UPDATE/DELETE en documents/tags/document_tags (y contents). Core: `SqliteSyncLocalStore` (outbox + tombstones + LWW) y `SupabaseSyncStore` (PostgREST con `fetch`, UPSERT `merge-duplicates`, `fetchImpl` inyectable). Borrados como tombstones, nunca DELETE. IPC: `sync:status|setEnabled|configure|run|ping` (viewer lectura, editor run, admin configure/setEnabled, con auditoría). UI: sección «Sincronización» en Ajustes (URL, anonKey, toggle, probar conexión, sincronizar ahora, pendientes). Proyecto remoto de desarrollo `jhxczeottwfmxuohdwqd`.
- FASE 12: búsqueda global estilo Raycast. Atajo global de sistema `Ctrl/Cmd+Shift+Espacio` (`globalShortcut`) que enfoca la ventana y emite `event:globalSearch`; `Ctrl/Cmd+K` la abre dentro de la app. El `CommandPalette` (cmdk) ahora busca documentos indexados en vivo (FTS con `useDeferredValue`), muestra título/ruta/score y navega al detalle, además de páginas y acciones. E2E ampliado para cubrir el overlay.
- FASE 11: licencias online. `LicenseService` (dominio) con activación/desactivación vía servidor HTTP y verificación local de firma Ed25519 (clave pública embebida; la clave de licencia solo se persiste como SHA-256; `expiresAt` vacío = perpetua). Migración 006 `license_columns`. `CryptoLicenseVerifier` con `canonicalJson` (JSON de claves ordenadas para firma determinista), `HttpLicenseServer` (`POST /v1/licenses/activate|deactivate`, timeout 10 s, mapeo HTTP→`LicenseError`), `SqliteLicenseRepository` (fila fija id=1). `deviceId` persistente en `device.id`. URL del servidor configurable vía `DOCUMIND_LICENSE_URL`. IPC: `license:status|activate|deactivate` (status viewer; activate/deactivate admin con auditoría). UI: sección «Licencia» en Configuración (estado/plan, activar con clave, desactivar admin-only).
- FASE 10: usuarios multi-rol y autenticación. `AuthService` (dominio) con scrypt (PHC `$scrypt$N=…,r=…,p=…$salt$hash`), tokens de sesión opacos de 256 bits (solo SHA-256 en DB, TTL 30 días), roles `admin`/`editor`/`viewer`, sesión persistente cifrada en `SecretStore` (kind `session`). Migración 005 `users_sessions`. IPC: 9 canales auth con guards de rol por canal (`auth:status|setup|register|login|logout|listUsers|setRole|changePassword|deleteUser`). UI: `AuthGate` (setup → login → app), `LoginPage`, `SetupPage`, `UsersPage` admin-only, badge de rol/logout en topbar y item Usuarios en sidebar solo admin.
- FASE 9.2: script `npm run audit:code` → `scripts/audit-code.mjs` (escáner de secretos en archivos versionados, sin dependencias; falla si detecta y reporta deuda TODO/FIXME/HACK sin bloquear).
- FASE 9.1: script `npm run audit` → `scripts/audit.mjs` (wrapper de `npm audit` con allowlist documentada GHSA-qwww-vcr4-c8h2, CSRF RSC/SSR no aplicable en SPA Electron/HashRouter).
- FASE 7: suite de tests unitarios e integración con Vitest, cobertura configurada (domain/core/ai/ocr).
- FASE 8.1: tests unitarios de `packages/ocr` (engine + worker): pool de workers, cola, concurrencia durante el arranque, errores, health y dispose (13 tests).
- FASE 8.3: cobertura ≥ 90% líneas/funciones y ≥ 80% ramas (94.86% / 90.59% / 82.54%): tests de integración para los repositorios sources, classification, ocr_queue y ai_cache/ai_usage; health fallback de Ollama; thresholds subidos a 90/90/80/90.
- FASE 8.2: E2E Playwright (smoke: abrir la app, escanear carpeta y buscar) con `@playwright/test`, userData aislado vía `DOCUMIND_USER_DATA` y job `e2e` en CI (xvfb).
- Sección «Actualizaciones» en Ajustes: comprobar manualmente, estado en vivo (`event:update:status`), descarga/progreso e instalación; config de canal, intervalo, auto-check y auto-download.
- Guardia de fronteras en ESLint para el renderer (prohibida la importación de infraestructura `@documind/core|ai|ocr|document`).

### Cambiado
- FASE 9.2: CI `verify` en matrix ubuntu/windows/macos (lint, typecheck, tests, smoke, build); nuevo job `coverage` con reporte v8 subido como artifact; `security.yml` audita con `npm run audit` (allowlist) y CodeQL ampliado a `security-and-quality`.
- FASE 9.1: upgrades de dependencias — raíz: ESLint 10 (+`@eslint/js` 10, `typescript-eslint` 8.65, `react-hooks` 7.1, `react-refresh` 0.5.3), Vitest 4 (+`@vitest/coverage-v8` 4.1.10, `eslint-config-prettier` 10); desktop: Vite 7.3.6, electron-vite 5, electron-builder 26.15.3, react-router-dom 7.18.2, sharp 0.35.3 (también `packages/document`). Overrides: `brace-expansion ^5.0.9` (GHSA-mh99-v99m-4gvg) y `exceljs` → `uuid ^11.1.1` + `archiver ^7.0.1`. Resultado: `npm audit` de 25 → 2 high (react-router, cubiertas por allowlist).
- Cobertura reconfirmada con Vitest 4 (91.77 / 80.77 / 90.9 / 93.02 vs thresholds 90/90/80/90) con tests nuevos: `paged()` en entities/document, health con errores no-Error (ollama/openrouter), `warn`/`error` sin stack en logger, búsqueda edge-cases y confidence NULL en `sqlite-*` repos.

### Corregido
- E2E smoke (FASE 8.2) roto por la autenticación de FASE 10: con userData limpio la app arrancaba en `SetupPage`; el test ahora crea el admin y abre sesión vía `api.auth` antes del reload.
- FASE 9.2: `security.yml` usaba `npm audit --audit-level=high`, que fallaba por el advisory allowlist de react-router; ahora usa `npm run audit`. Eliminado script raíz `release` (referenciaba `scripts/release.mjs` inexistente).
- Patrón setState-en-render en `settings-page.tsx` (regla `react-hooks/set-state-in-effect` de react-hooks 7): ajuste-en-render con `lastData` + `dirty`.
- `eslint.config.mjs` para ESLint 10/react-hooks 7: `react-hooks/incompatible-library: off` (ruido del React Compiler, no usado) y globals de Node para `scripts/**/*.mjs`.
- Concurrencia en `TesseractOcrEngine`: dos `recognize()` simultáneos durante el arranque duplicaban el pool de workers; ahora el arranque comparte un `workersReady`.

## [0.1.0] — 2026-07

### Añadido
- FASE 1–3: monorepo npm workspaces (TypeScript estricto con project references), Clean Architecture con puertos, SQLite + FTS5 con capas Repository, Event Bus, dominio (documentos, clasificación, etiquetas, búsqueda), `packages/ai` (AIProvider + OpenRouter/OpenAI/Gemini/Claude/Ollama, rate limit, presupuesto, caché, consumo), `packages/ocr` (Tesseract en worker threads), `packages/document` (extractores PDF/Word/Excel/imagen, hash streaming).
- FASE 4–5: proceso principal Electron (ventana segura con CSP, preload tipado, IPC allowlist), FileWatcher (chokidar), respaldos/restauración, auditoría y automatizaciones, UI completa (dashboard, documentos con tabla virtualizada, búsqueda, detalle, etiquetas, OCR, IA, ajustes, respaldos, automatizaciones, historial), command palette, drag & drop, onboarding.
- Seguridad: `SecretStore` AES-256-GCM (claves API cifradas, nunca en `settings.json`), logger con redacción, rutas seguras (`safeResolve`), statements preparados, validación Zod en IPC.
- FASE 6: CI/CD con GitHub Actions (`ci.yml`, `release.yml`, `security.yml`), `electron-builder` x3 plataformas, auto-update con `electron-updater` e UI de actualizaciones.

### Corregido
- Navegación rota en producción: `BrowserRouter` → `HashRouter` para el protocolo `file://`.
- Compatibilidad ABI de SQLite: `better-sqlite3` → `node:sqlite`.
- Import de `electron-updater` (CJS) en el bundle main del proceso principal.
