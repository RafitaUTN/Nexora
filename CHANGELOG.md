# Changelog

Todas las versiones notables de DocuMind Desktop se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/); versionado semántico.

## [No publicado]

### Añadido
- FASE 7 (parcial): suite de tests unitarios e integración con Vitest, cobertura configurada (domain/core/ai/ocr).
- Sección «Actualizaciones» en Ajustes: comprobar manualmente, estado en vivo (`event:update:status`), descarga/progreso e instalación; config de canal, intervalo, auto-check y auto-download.
- Guardia de fronteras en ESLint para el renderer (prohibida la importación de infraestructura `@documind/core|ai|ocr|document`).

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
