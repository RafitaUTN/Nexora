# DocuMind Desktop

Gestión inteligente de documentos para PYMES: organiza, clasifica, indexa y permite búsquedas inteligentes sobre miles de documentos (PDF, Word, Excel, imágenes) con IA, funcionando sin conexión.

[![CI](https://github.com/RafitaUTN/Nexora/actions/workflows/ci.yml/badge.svg)](https://github.com/RafitaUTN/Nexora/actions/workflows/ci.yml)
[![Security](https://github.com/RafitaUTN/Nexora/actions/workflows/security.yml/badge.svg)](https://github.com/RafitaUTN/Nexora/actions/workflows/security.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](CHANGELOG.md)

## Características

- **Escaneo e indexación** de carpetas con watcher en tiempo real: extracción de PDF/Word/Excel/imágenes, hash por contenido, deduplicación y OCR (Tesseract) para documentos escaneados.
- **Búsqueda local** (FTS5) por contenido con resaltado, filtros y ranking; overlay global estilo Raycast con `Ctrl/Cmd+K` y atajo de sistema `Ctrl/Cmd+Shift+Espacio`.
- **IA opcional** (OpenRouter, OpenAI, Gemini, Claude u Ollama): clasificación y etiquetado automático, resumen de documentos, preguntas y respuestas con citas (RAG local), con presupuesto de tokens y caché para contener costes.
- **Gestión de etiquetas** y asignaciones inteligentes, dashboard con métricas, historial de cambios y auditoría completa.
- **Respaldos y restauración** con verificación de integridad (hash) y **automatizaciones** (reglas de movimiento, renombrado y etiquetado).
- **Sincronización entre dispositivos** vía Supabase (LWW con tombstones), con autenticación por usuario y RLS por `auth.uid()`, y auto-sync en segundo plano.
- **Multiusuario** local con roles (admin/editor/viewer), sesión cifrada y licencias online verificadas por firma.
- **Actualizaciones automáticas** firmadas y con rollback; la app se distribuye para Windows, macOS y Linux.
- **Privacidad por diseño**: el 100 % de los datos vive en el equipo (SQLite local + FTS5); las claves API se guardan cifradas (AES-256-GCM) y los documentos completos nunca salen del dispositivo hacia la IA.

## Requisitos

- Node.js ≥ 22 y npm ≥ 10 para desarrollo.
- Windows, macOS o Linux para ejecutar la aplicación empaquetada.
- Sin módulos nativos de ABI específico: SQLite usa `node:sqlite` (built-in).

## Desarrollo

```bash
npm install          # instala todo el workspace
npm run dev          # lanza Electron con hot-reload
```

| Comando | Acción |
|---|---|
| `npm run typecheck` | TypeScript estricto en todos los paquetes |
| `npm run lint` | ESLint + Prettier (0 warnings) |
| `npm test` | Vitest (unit + integración) |
| `npm run test:coverage` | Cobertura (umbrales 90/90/80/90) |
| `npm run audit` | `npm audit` con allowlist documentada |
| `npm run audit:code` | Escáner de secretos y deuda en el código |
| `npm run build` | Build de producción (out/) |
| `npm run smoke` | Smoke tests del proceso principal y módulos |
| `npm run e2e` | E2E Playwright (requiere `npm run build` previo) |

### Empaquetado

```bash
npm run build:win     # NSIS (Windows x64)
npm run build:mac     # dmg (macOS)
npm run build:linux   # AppImage + deb (Linux)
```

## Estructura del repositorio

```
apps/desktop          → aplicación Electron (main/preload/renderer)
packages/domain       → entidades, casos de uso y puertos (Clean Architecture)
packages/core         → infraestructura (config, secretos, logs, eventos, DB SQLite)
packages/ai           → proveedores de IA (OpenRouter, OpenAI, Gemini, Claude, Ollama)
packages/ocr          → OCR Tesseract en worker threads
packages/document     → extractores (PDF/Word/Excel/imagen) e indexación
packages/shared       → tipos y schemas Zod compartidos
docs                  → arquitectura, ADRs, roadmap y guías
```

La capa de dominio no depende de la infraestructura (inversión de dependencias resuelta en el proceso principal).

## Documentación

| Documento | Contenido |
|---|---|
| [Arquitectura](docs/architecture/overview.md) | Visión general, C4 y modelo de módulos |
| [Decisiones (ADRs)](docs/architecture/adr/) | ADR-0001 … ADR-0013 |
| [Modelo de datos](docs/architecture/data-model.md) | Esquema SQLite, FTS5 y migraciones |
| [Seguridad](docs/architecture/security.md) | Modelo de amenazas y controles |
| [Estrategia de IA](docs/architecture/ai-strategy.md) | Proveedores, costes y límites |
| [Roadmap](docs/architecture/roadmap.md) | Plan por fases |
| [Guía de desarrollo](docs/guides/development.md) | Puesta en marcha y convenciones |
| [Guía de despliegue](docs/guides/deployment.md) | Empaquetado y publicación de releases |
| [Contribuciones](docs/guides/contributing.md) | Guía para contribuir |

## Publicación de releases

1. Commit convencional → PR → CI verde.
2. Etiquetar la versión: `git tag v1.0.0 && git push origin v1.0.0`.
3. El workflow `release.yml` construye, firma y publica los instaladores y el feed de actualizaciones.

## Licencia

Proyecto privado (`UNLICENSED`). Todos los derechos reservados.
