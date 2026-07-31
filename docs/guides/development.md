# Guía de desarrollo

## Requisitos
- Node.js ≥ 22, npm ≥ 10.
- Visual Studio Build Tools (para módulos nativos en Windows) o Xcode CLT (macOS).
- Python 3.x (para node-gyp en algunos módulos).

## Instalación
```bash
npm install        # instala todo el workspace
npm run rebuild    # electron-builder install-app-deps (rebuild nativos)
```

## Comandos
| Comando | Acción |
|---|---|
| `npm run dev` | Lanza Electron con hot-reload (dev) |
| `npm run typecheck` | tsc en todos los paquetes |
| `npm run lint` | ESLint + Prettier --check |
| `npm run lint:fix` | autofix |
| `npm test` | Vitest (unit + integración) |
| `npm run test:coverage` | coverage |
| `npm run build` | build de producción |
| `npm run audit` | `npm audit --audit-level=high` |

## Estructura
```
apps/desktop          → aplicación Electron (main/preload/renderer)
packages/domain       → entidades + casos de uso + puertos
packages/core         → infra (config, secrets, logs, eventos, DI, DB)
packages/ai           → proveedores IA
packages/ocr          → OCR Tesseract
packages/document     → extractores + indexación
packages/shared       → tipos + schemas Zod compartidos
```

## Convenciones
- Conventional Commits (commitlint). Ej: `feat(ocr): reintentos con backoff`.
- TypeScript estricto; `satisfies` para objetos; tipos inmutables (`readonly`) donde aplique.
- Reglas de import: el dominio **no** importa infraestructura (ESLint `no-restricted-imports`).
- No comentarios salvo para lógica compleja (el código debe leerse por sí mismo).
- Componentes ≤ 300 líneas; si excede, dividir.
- Tests junto al código: `*.test.ts`.

## Módulos nativos
- SQLite usa `node:sqlite` (built-in de Node): sin módulos nativos de ABI específico ni `npm run rebuild` para Electron.
- Los módulos N-API (`sharp`, `@napi-rs/canvas`) no requieren rebuild.
