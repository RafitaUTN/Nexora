# ADR-0004 — SQLite (node:sqlite) + FTS5 + capa Repository

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
Datos 100% locales, sin conexión, con requisito de escalar a +1M documentos y búsqueda full-text rápida. El futuro podría requerir sincronización en la nube (Postgres/Supabase).

## Opciones
| Opción | Ventajas | Desventajas |
|---|---|---|
| **SQLite + node:sqlite + FTS5** | Sin servidor, transaccional, FTS5 de serie, preparación de statements (anti-SQL-injection), escritura por lotes muy rápida | Concurrencia de escritura limitada (se mitiga con cola de escritura single-writer) |
| PostgreSQL embebido | Potente | Pesado para desktop, empaquetado complejo |
| nivel/JSON binario | Simple | Sin queries relacionales ni FTS |

## Decisión
**node:sqlite** (`node:sqlite`, built-in de Node, síncrono e ideal para el proceso principal) con:

- **Migraciones versionadas** en SQL (`packages/core/db/migrations`), con tabla `schema_migrations` y `PRAGMA user_version`.
- **FTS5** con tablas virtuales `documents_fts` (contentless external content) para búsqueda full-text por contenido.
- **WAL mode** + `synchronous=NORMAL` + `foreign_keys=ON` + `busy_timeout`.
- **Capa Repository**: cada puerto tiene implementación SQLite; la construcción de queries vive en los repositorios, los casos de uso jamás escriben SQL.

## Consecuencias
- Migrar a Postgres/Supabase = implementar los mismos puertos con otro adaptador (ADR-0003). El schema SQL de Postgres se documenta como referencia futura en `data-model.md`.
- Estrategia de rendimiento detallada en `performance.md` (lotes, índices, sin N+1, single-writer).
