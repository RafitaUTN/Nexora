# Roadmap

## Fases

### FASE 0 — Arquitectura y documentación (✅ completada)
- ADRs 0001–0010, modelo de datos, seguridad, rendimiento, IA, updates, CI/CD.
- Decisiones validadas: Electron+electron-vite+electron-builder, monorepo workspaces, Clean Architecture con puertos, SQLite+FTS5+capas Repository, Event Bus, AIProvider, electron-updater.

### FASE 1 — Fundación del repositorio (✅)
- Monorepo npm workspaces, TypeScript estricto con project references.
- ESLint (typescript-eslint, react, import), Prettier, Husky, lint-staged, commitlint.
- electron-vite + TailwindCSS + shadcn/ui + dependencias del renderer.

### FASE 2 — Núcleo de infraestructura
- Config (settings) con esquemas Zod y tipos compartidos.
- `SecretStore` AES-256-GCM.
- Logger estructurado con redacción.
- Event Bus tipado.
- Contenedor DI (composition root).
- SQLite: conexión, migraciones versionadas, repositorios (documents, tags, settings, audit, history, ai_usage, ai_cache, ocr_queue), FTS5.

### FASE 3 — Dominio, IA y OCR
- Entidades y casos de uso: Documentos (CRUD, dedupe, versionado, historial), Clasificación, Etiquetas, Búsqueda FTS + semántica.
- `packages/ai`: AIProvider + OpenRouter (+ stubs OpenAI/Gemini/Claude/Ollama), rate limit, presupuesto de tokens, caché, consumo.
- `packages/ocr`: Tesseract en worker threads, detección de idioma, reintentos, confianza.
- `packages/document`: extractores PDF/Word/Excel/imagen, hash streaming, MIME por contenido, ingestión por lotes.

### FASE 4 — Proceso principal Electron + módulos de plataforma
- Ventanas (BrowserWindow seguro, CSP), preload tipado, IPC allowlist.
- FileWatcher (chokidar) con debounce y dedupe.
- Respaldos/restauración (copiar DB + config, hash, verificación).
- Automatizaciones (reglas sobre eventos).
- Auditoría completa, logs/diagnóstico.
- Licenciamiento (estructura, sin pagos).

### FASE 5 — UI/UX
- Shell: layout (sidebar, header), temas claro/oscuro, atajos.
- Dashboard, Documentos (tabla virtualizada), Búsqueda, Detalle de documento, Etiquetas, OCR, IA, Configuración, Respaldos, Automatizaciones, Historial.
- Command palette, drag & drop, estados vacíos/loading, notificaciones, onboarding.

### FASE 6 — CI/CD + Actualizaciones
- Workflows GitHub Actions (ci, codeql, release, security).
- electron-builder x3 plataformas, firma, publish, changelog, auto-update con verificación y rollback.

### FASE 7 — Testing y auditoría final
- Unit (domain/core/ai/ocr) con fakes de puertos, coverage ≥ 90%. ✅ (107 tests, 85% → thresholds 85)
- Integration (repositorios contra SQLite temporal, AIProvider contra mock server). ✅
- E2E Playwright (smoke: abrir, escanear carpeta, buscar). ✅ (detallado en FASE 8.2; adaptado en FASE 11 al flujo de autenticación)
- Auditoría: ESLint import/no-restricted, `npm audit`, CodeQL report, revisión deuda técnica. ✅ Parcial (deps + `npm audit` en FASE 9.1; CodeQL/deuda → FASE 9.2)

### FASE 8 — Tests OCR y cobertura ≥ 90%
- FASE 8.1 Unit tests de `packages/ocr` (engine + worker): pool, cola, concurrencia, errores, health, dispose. ✅ (13 tests)
  - Bug real corregido: `recognize()` simultáneos durante el arranque duplicaban el pool (spawn) → `workersReady` compartido.
- FASE 8.2 E2E Playwright (smoke: abrir, escanear carpeta, buscar). ✅
  - `@playwright/test`, `playwright.config.ts`, `e2e/smoke.spec.ts` (lanza Electron con la build, `DOCUMIND_USER_DATA` aislado, añade fuente por API, escanea y busca).
  - Job `e2e` en CI (ubuntu + `xvfb-run`).
  - Adaptado en FASE 11: primer arranque ahora crea el admin (`auth.setup` + `auth.login`) antes del reload, por la compuerta de autenticación de FASE 10.
- FASE 8.3 Cobertura ≥ 90% líneas/funciones, ≥ 80% ramas. ✅ (94.86% / 90.59% / 82.54%)
  - Cubiertos los 4 repositorios a 0%: sources, classification, ocr_queue, ai_cache/ai_usage (tests de integración).
  - Añadido health fallback de Ollama (ramas del catch).
  - Thresholds subidos en `vitest.config.ts` a 90/90/80/90.

### FASE 9 — Auditoría y deuda técnica
- FASE 9.1 Upgrades de dependencias + auditoría de seguridad. ✅
  - Raíz: ESLint 10 (+`@eslint/js` 10, `typescript-eslint` 8.65, `react-hooks` 7), Vitest 4 (+`@vitest/coverage-v8` 4, soporta Vite 7).
  - Desktop: Vite 7.3.6, electron-vite 5, electron-builder 26.15.3, react-router-dom 7.18.2, sharp 0.35.3 (también en `packages/document`).
  - Overrides: `brace-expansion ^5.0.9` (GHSA-mh99-v99m-4gvg) global y `exceljs` → `uuid ^11.1.1` + `archiver ^7.0.1`.
  - `npm audit`: de 25 → 2 vulnerabilidades high, ambas `react-router`/`react-router-dom` (GHSA-qwww-vcr4-c8h2, CSRF solo en RSC/SSR — no aplicable en SPA Electron/HashRouter); allowlist documentada en `scripts/audit.mjs` + script `npm run audit`.
  - Cobertura reconfirmada tras el upgrade (91.77 / 80.77 / 90.9 / 93.02) con tests nuevos: `paged()` en `document.ts`, health con errores no-Error en providers, `warn`/`error` sin stack en logger, búsqueda edge-cases y confidence NULL en SQLite.
  - `build`, `e2e` y `npm run audit` verificados localmente.
- FASE 9.2 CI multi-OS, cobertura v8 y auditoría de código. ✅
  - `ci.yml`: job `verify` en matrix `ubuntu/windows/macos` (lint, typecheck, tests, smoke, build); job `coverage` (v8 + upload de `coverage/`); `e2e` en ubuntu (xvfb).
  - `security.yml`: audit con `npm run audit` (allowlist GHSA-qwww-vcr4-c8h2) en vez de `npm audit --audit-level=high` (que fallaba por el advisory permitido); CodeQL ampliado a `security-and-quality`.
  - `scripts/audit-code.mjs`: escáner de secretos en archivos versionados (falla si detecta) + reporte de deuda TODO/FIXME/HACK (no bloquea); script raíz `audit:code`.
  - Eliminado script raíz `release` (referenciaba `scripts/release.mjs` inexistente); `docs/guides/contributing.md` actualizado.
- FASE 9.3 Revisión de deuda técnica. ✅ (decisión)
  - `format:check` falla de forma preexistente en 86 archivos (59 ts, 21 md, 2 json, 1 mjs, 1 yml — ADRs, docs, configs y componentes). Decisión: no formatear el repo entero (diff mecánico grande); lint-staged formatea solo lo modificado en cada commit. Deuda documentada, no bloqueante.

### FASE 10 — Usuarios multi-rol y autenticación
- FASE 10.1 Dominio y core de autenticación. ✅ (commit `61579a7`)
  - ADR-0011: hash scrypt (`node:crypto`) en formato PHC propio `$scrypt$N=…,r=…,p=…$salt$hash`; roles `admin`/`editor`/`viewer`; sesiones por token opaco de 256 bits con SHA-256 en DB y TTL 30 días. Argon2 descartado (`@node-rs/argon2` no verifica en Node 24/win32).
  - Migración 005 (`users_sessions`): tablas `users` (username UNIQUE NOCASE, role CHECK) y `sessions` (token_hash UNIQUE, FK CASCADE).
  - Dominio: `entities/user` (schemas Zod), puertos `PasswordHasher`, `SessionTokenService`, `UserRepository`, `SessionRepository`; `AuthService` con `AuthError` (códigos) y validación de permisos por rol; `toPublicUser` nunca expone el hash.
  - Core: `ScryptPasswordHasher` (timingSafeEqual), `CryptoSessionTokens`, `SqliteUserRepository`, `SqliteSessionRepository`.
  - Tests: `auth-service` (setup/lock, login, expiración, roles, cambio de contraseña), scrypt y repos SQLite. Cobertura 92.02/81.6/91.48/93.7.
- FASE 10.2 IPC y sesión persistente en el proceso principal. ✅
  - Canales auth en `IpcChannel` (`auth:status|setup|register|login|logout|listUsers|setRole|changePassword|deleteUser`).
  - `SessionManager` en main: el token crudo nunca cruza IPC (solo usuarios públicos); se persiste cifrado en `SecretStore` (kind `session`) y se restaura al arranque.
  - `runtime.ts` monta `AuthService` + repos users/sessions; guards de rol en IPC: viewer solo lectura, editor opera documentos, admin configuración/usuarios/backups.
- FASE 10.3 UI de autenticación y gestión de usuarios. ✅
  - `AuthGate` (setup → login → app), `LoginPage`, `SetupPage`; store zustand `useAuth`.
  - `UsersPage` admin-only (crear, rol, eliminar, cambiar contraseña) + enlace en sidebar solo admin; topbar muestra usuario/rol y logout.

### FASE 11 — Licencias online
- ADR-0012: licencias firmadas con Ed25519. El servidor firma el payload (keySha256, tier, deviceId, activatedAt, expiresAt, maxDevices) y la app lo verifica localmente con la clave pública embebida; la clave de licencia solo se guarda como SHA-256. `expiresAt` vacío = perpetua.
- Dominio: entidad `License` reescrita con `signature`, puertos `LicenseRepository`/`LicenseServer`/`LicenseVerifier`, `LicenseService` con `status()` (re-evalúa firma/expiración en cada lectura), `activate()`, `deactivate()` best-effort, `isEntitled()` y `LicenseError` con códigos.
- Core: migración 006 `license_columns` (key_sha256, signature, max_devices); `SqliteLicenseRepository` (fila fija id=1); `CryptoLicenseVerifier` con `canonicalJson` (claves ordenadas) y clave pública dev embebida; `HttpLicenseServer` (`POST /v1/licenses/activate|deactivate`, timeout 10s, mapeo de errores HTTP→LicenseError).
- Integración: canales `license:status|activate|deactivate` (status = viewer; activate/deactivate = admin, con auditoría); `deviceIdOf` (archivo `device.id` persistente); URL configurable vía `DOCUMIND_LICENSE_URL`.
- UI: sección «Licencia» en Configuración (badge de estado/plan, activar con clave, desactivar admin-only).
- Verificación: 199 tests, cobertura 92.37/82.98/91.8/94.03; typecheck, lint y build OK.

### FASE 12 — Búsqueda global (Raycast-style)
- Atajo global de sistema con `globalShortcut` (`Ctrl/Cmd+Shift+Espacio`) que enfoca la ventana y emite `event:globalSearch`; también se abre en-app con `Ctrl/Cmd+K`.
- `CommandPalette` extendido: busca documentos indexados en vivo (FTS vía `search:query`, `useDeferredValue` como debounce), muestra título/ruta/score y navega a `/documents/:id`; conserva las páginas y acciones (tema).
- Evento `EventGlobalSearch` en `IpcEvent`; suscripción en `AppShell`.
- E2E ampliado: abre el overlay con Ctrl+K, busca por contenido, selecciona y navega al detalle.

### FASE 13 — Sincronización entre dispositivos (Supabase/Postgres)
- ADR-0013: LWW por `updatedAtMs`; outbox local llenado por triggers SQLite (migración 007 `sync_outbox` + `sync_meta`); borrados como tombstones; claves compuestas `entity:entityKey`; configuración en `settings` (`sync.settings`); `anonKey` publicable.
- Dominio: `entities/sync`, `ports/sync` (`SyncLocalStore`/`SyncRemoteStore`), `SyncService` (`sync` idempotente, `ping`, `status`, `setEnabled`, `configure`).
- Core: `SqliteSyncLocalStore`, `SupabaseSyncStore` (PostgREST con `fetch`); triggers AFTER INSERT/UPDATE/DELETE en documents/tags/document_tags (+ contents).
- Integración: canales `sync:status|setEnabled|configure|run|ping` (viewer lectura, editor run, admin configure/setEnabled, con auditoría); UI «Sincronización» en Ajustes.
- Verificación: 233 tests, cobertura 91.95/80.26/92.03/94; typecheck, lint, build y smoke OK.

### FASE 13 — Resumen y Q&A (IA), auto-sync y autenticación
- `SummarizeService` y `QaService` (dominio) con caché por hash, presupuesto de tokens y RAG por FTS5; canales `ai:summarize|ai:qa` (rol editor) y UI de resumen en el detalle + página `/qa`.
- Auto-sync en segundo plano: primer disparo a los 5 s y luego cada 15 min (`sync:status` al renderer).
- Supabase Auth: `SupabaseAuthClient` (login/refresh/signUp, GoTrue con `fetch`), sesión cifrada en `SecretStore`, `SupabaseSyncStore` autenticado con `user_id` por fila; canales `sync:signUp|signOut` y UI de cuenta en Ajustes.
- RLS por `auth.uid()` en las 4 tablas remotas (migración `rls_user_scoped_sync`): columna `user_id` + políticas `sync_*_own`; se eliminan las permisivas `anon`.

### FASE 14 — Release 1.0.0 (✅ tag `v1.0.0`)
- Seguridad de release: credencial E2E extraída a entorno (`DOCUMIND_E2E_PASSWORD`) → `audit:code` limpio.
- Versionado a `1.0.0` en todo el workspace (root, desktop, 6 paquetes, `package-lock.json`, `APP_VERSION`).
- README raíz con features, requisitos, comandos y estructura; CHANGELOG cerrado como `[1.0.0] — 2026-07-31`.
- Verificación completa: audit, audit:code, typecheck, lint, tests (251), cobertura ≥ umbrales, build, smoke y e2e.
- Commit + tag `v1.0.0` que dispara `release.yml` (build/publish x3 OS + feed de actualizaciones).

### FASE 15 — Colaboración multiusuario (✅ tag `v1.1.0`)
- FASE 15.1 Modelo de compartición. ✅
  - Dominio: entidad `share` (uid canónico, ownerEmail/memberEmail, rol `viewer`/`editor`, estado `invited`/`active`/`revoked`), `ShareService` (invite/accept/revoke/setRole/list), puertos `ShareRepository`/`ShareMailResolver`.
  - Core: migración 008 `shares` (tabla + triggers outbox `sync_shares_*`) y 009 `shared_documents` (columna `shared`); `SqliteShareRepository`; `share` en `SqliteSyncLocalStore`/`SupabaseSyncStore` (push con uid canónico, pull con `owner_user_id`).
- FASE 15.2 RLS remoto y marcado local de compartidos. ✅
  - Migración remota `rls_shared_libraries` (aplicada): tabla `sync_shares` + políticas `sync_shares_own` (owner) / `sync_shares_member_select` / `sync_shares_member_update`, y políticas de lectura compartida `sync_documents_shared_read`, `sync_tags_shared_read`, `sync_document_tags_shared_read` para miembros.
  - `SqliteSyncLocalStore` recibe `getCurrentUserId()` y marca `shared = 1` en documentos de otro propietario.
- Release `v1.0.0` publicado. ✅ (run `30644903518`, assets win/mac/linux; draft → público)
- FASE 15.3 Integración IPC y UI. ✅
  - Canales `SharesList/Invite/Accept/Revoke/SetRole/Outgoing/Incoming` con Zod; roles: admin invite/revoke/setRole, editor accept, viewer consultas; auditoría `share.*`; evento `shares:changed` para invalidar la UI.
  - Preload expone `window.api.shares`; renderer: sección «Compartir» en Ajustes (invitar por email, roles, revocar, pendientes entrantes/aceptar, salientes, badges de estado).
- FASE 15.4 Resolución de conflictos por campos. ✅
  - Migración 010 `sync_last_payload`: `markSynced` guarda el último payload subido como línea base por clave.
  - `tryMergeDocument` en `applyRemote`: para documentos con outbox local pendiente, combina campo a campo contra la línea base; si ambos lados modificaron el mismo campo gana el de mayor `updatedAtMs`; el resultado queda pendiente (merge bidireccional).
- FASE 15.5 Verificación y release `v1.1.0`. ✅
  - Verificación completa: audit, audit:code, typecheck, lint, 293 tests, cobertura (92.5/80.23/92.09/94.86), build, smoke y e2e.
  - Commit + tag `v1.1.0` que dispara `release.yml`.

### FASE 16 — Actualizaciones automáticas con confirmación (🔜 tag `v1.1.1`)
- Chequeo automático periódico en el proceso principal respetando `updates.autoCheck` y `updates.checkIntervalHours` (15 s tras arrancar, cada ciclo re-lee los ajustes). ✅
- `UpdateManager` con `autoDownload = false`: pregunta antes de descargar. ✅
- Modal global `UpdateModal`: al detectar versión nueva informa de la versión y permite descargar/instalar o posponer (no reaparece para la misma versión). Canal IPC `UpdatesDownload`. ✅
- Fix: `updates.check()` ya no se bloquea por `autoCheck=false` (el botón manual siempre consulta). ✅
- E2E del modal de actualización (`e2e/smoke.spec.ts`). ✅
- Versión 1.1.1 publicada y verificable con la release `v1.1.1` (chequeo contra GitHub Releases). ✅

## Post-MVP
- Compartición por carpetas individuales y control granular por documento.
