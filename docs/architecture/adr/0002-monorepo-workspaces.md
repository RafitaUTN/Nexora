# ADR-0002 — Monorepo npm workspaces

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
DocuMind necesita límites de módulos estrictos (Clean Architecture) y paquetes que puedan publicarse/versionarse de forma independiente (p. ej. `packages/ai` para uso futuro en otros productos).

## Opciones
- **Monorepo npm workspaces** con paquetes por capa.
- Single-package con carpetas `src/main/domain`, etc.
- Monorepo pnpm/turborepo.

## Decisión
**npm workspaces** con esta estructura:

```
apps/desktop     Electron (main, preload, renderer) + composición + UI
packages/domain  Entidades, casos de uso, puertos (sin deps de infra)
packages/core    Config, secretos, logging, Event Bus, DI, SQLite, repositorios
packages/ai      Interfaz AIProvider + adaptadores (OpenRouter, etc.)
packages/ocr     Motor Tesseract + cola en worker threads
packages/document Extractores PDF/Word/Excel/imagen + indexación + dedupe
packages/shared  Tipos, schemas Zod, constantes compartidas (main+renderer)
```

Se evita turbo/pnpm para no añadir complejidad de tooling; el desacoplamiento lo garantizan las reglas de `tsconfig` project references y ESLint (imports prohibidos de infra en domain).

## Consecuencias
- `npm install` en la raíz instala todo el workspace.
- Los módulos nativos se reconstruyen para Electron con `electron-builder install-app-deps`.
- Electron-vite agrupa los paquetes workspace al compilar el proceso principal.
