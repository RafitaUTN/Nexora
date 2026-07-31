# Seguridad — modelo de amenazas y controles

Alcance: proteger los documentos del cliente (facturas, contratos, datos personales) y la integridad del producto. Mapeo amenaza → control → evidencia en código.

## 1. Confidencialidad de datos

| Amenaza | Control |
|---|---|
| Claves API robadas del disco | `SecretStore` con **AES-256-GCM** (`node:crypto`); clave derivada (PBKDF2) de secreto máquina + passphrase del usuario. Nunca en `settings.json`. |
| Lectura no autorizada del renderer | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` (ADR-0009). El renderer solo ve estados, no valores de claves. |
| Logs con secretos | Logger con redacción (`redact: ['apiKey','Authorization','key_cipher']`). |
| Exfiltración vía IA | Nunca se envían documentos completos; solo fragmentos necesarios dentro de un presupuesto de tokens (ADR-0006). Configurable y documentado en `ai-strategy.md`. |

## 2. Integridad

| Amenaza | Control |
|---|---|
| Actualización corrupta | Verificación SHA-256 + firma (ADR-0008); rollback automático con health-check. |
| Backup corrupto | Hash SHA-256 de cada backup al crear y validación al restaurar. |
| Modificación de archivos | Hash `sha256` por documento; el watcher detecta cambios por mtime+size+hash. |

## 3. Ataques de entrada

| Ataque | Control |
|---|---|
| Path traversal | Toda ruta pasa por `safeResolve(root, userPath)`: normaliza con `path.resolve`, verifica que esté dentro de la raíz permitida, rechaza `..` y bloquea accesos fuera. |
| Command injection | No se ejecutan comandos del sistema con entrada de usuario. Si algún día se necesita, se usaría `spawn` con array de args (sin shell). |
| SQL injection | 100% statements preparados (better-sqlite3). |
| XSS | React escapa por defecto; contenido de documentos se renderiza como texto plano; CSP estricta sin `eval` en producción. |
| Prototype pollution | Schemas **Zod** en todo el IPC; helpers propios inmutables; `Object.freeze` en constantes compartidas. |
| MIME/extensión engañosos | Validación por extensión permitida **y** `mime` detectado por contenido (firma de bytes) para la ingesta. |

## 4. Race conditions

- Escritura en SQLite a través de una **cola single-writer** (mutex en proceso principal); WAL + `busy_timeout`.
- El watcher des-duplica eventos (debounce + hash).
- La deduplicación usa `INSERT ... ON CONFLICT` con hash único.

## 5. Auditoría

Tabla `audit_log` registra: importar/eliminar claves, restaurar backups, mover/renombrar en lote, cambiar config de seguridad, actualizaciones aplicadas/fallidas, autenticación futura.

## 6. Buenas prácticas DevOps

- Dependabot + Renovate para CVEs.
- CodeQL y secret scanning en CI.
- `npm audit` en CI (fail on high).
- Menor superficie: se minimizan dependencias; módulos nativos solo `better-sqlite3`.
- Secrets nunca en el repo; se pasan por variables de entorno de CI (firma, notarización).
