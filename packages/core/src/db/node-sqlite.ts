import { createRequire } from 'node:module'
import type * as NodeSqlite from 'node:sqlite'

/**
 * Acceso a `node:sqlite` (built-in de Node 22.5+). Se carga con `createRequire`
 * en lugar de un import estático para sortear el quirk de Node 24 donde el
 * builtin solo existe con el prefijo `node:` (y herramientas como vite-node
 * normalizan los specifiers `node:*` al nombre pelado).
 */
const require = createRequire(import.meta.url)

export const { DatabaseSync } = require('node:sqlite') as typeof NodeSqlite

/** Tipo de la clase `DatabaseSync` (para declarar dependencias sin importar el valor). */
export type DatabaseSync = NodeSqlite.DatabaseSync
