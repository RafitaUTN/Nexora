# ADR-0001 — Electron como runtime de escritorio

**Estado:** Aceptado · **Fecha:** 2026-07-31 · **Decisiones relacionadas:** ADR-0002, ADR-0008

## Contexto
Se necesita una aplicación de escritorio multiplataforma (Windows, Linux, macOS) con acceso profundo al filesystem, worker threads para OCR, base de datos local SQLite y capacidad de actualización automática.

## Opciones consideradas
| Opción | Ventajas | Desventajas |
|---|---|---|
| **Electron** | Ecosistema maduro, Node 22+ en main (módulos nativos, worker_threads), electron-builder maduro, update mechanism probado | Tamaño y RAM mayores |
| Tauri | Binario pequeño, Rust | Compromete worker_threads/módulos nativos para OCR/SQLite; ecosistema update más joven |
| .NET MAUI/WPF | Nativo Windows | No hay portabilidad real Linux/macOS sin reescritura |

## Decisión
Usar **Electron** con **electron-vite** (build) y **electron-builder** (empaquetado).

## Consecuencias
- El proceso principal ejecuta Node real: podemos usar `node:sqlite`, `worker_threads`, `node:crypto` y `fetch` nativo.
- Se exige disciplina de seguridad (contextIsolation, sandbox, IPC allowlist) — ADR-0009.
- El tamaño del instalador (~90–120 MB) es aceptable para software comercial de gestión documental.
