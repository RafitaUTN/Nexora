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
- E2E Playwright (smoke: abrir, escanear carpeta, buscar). ⏳ Pendiente
- Auditoría: ESLint import/no-restricted, `npm audit`, CodeQL report, revisión de deuda técnica. ⏳ Pendiente (FASE 9)

### FASE 8 — Tests OCR y cobertura ≥ 90%
- FASE 8.1 Unit tests de `packages/ocr` (engine + worker): pool, cola, concurrencia, errores, health, dispose. ✅ (13 tests)
  - Bug real corregido: `recognize()` simultáneos durante el arranque duplicaban el pool (spawn) → `workersReady` compartido.
- FASE 8.2 E2E Playwright (smoke: abrir, escanear carpeta, buscar). ⏳ Pendiente
- FASE 8.3 Cobertura ≥ 90% líneas/funciones, ≥ 80% ramas. ✅ (94.86% / 90.59% / 82.54%)
  - Cubiertos los 4 repositorios a 0%: sources, classification, ocr_queue, ai_cache/ai_usage (tests de integración).
  - Añadido health fallback de Ollama (ramas del catch).
  - Thresholds subidos en `vitest.config.ts` a 90/90/80/90.

## Post-MVP
- Usuarios multi-rol (Argon2, sesiones), activación de licencias online, sincronización Supabase/Postgres, colaboración, plugin de búsqueda de escritorio (Raycast-style).
