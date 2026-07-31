# ADR-0009 — Seguridad: contexto aislado, sandbox e IPC allowlist

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
La app manipula documentos personales de PYMES (facturas, contratos, datos de clientes). El renderer no debe tener acceso a Node ni al filesystem más que por canales explícitos, validados y registrados.

## Decisiones
1. **BrowserWindow**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`.
2. **Preload**: expone una API mínima y tipada (`window.documind`) con `contextBridge`; cada método valida entradas con **Zod** en el proceso principal (nunca confiar en el renderer).
3. **IPC allowlist**: tabla de canales (invocar/eventos) registrada en `ipc/channels.ts`. Solo los canales registrados se sirven; el resto se rechaza y se audita. No hay `ipcMain.handle('*')`.
4. **CSP estricta** (meta + header) para el renderer: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'` (Tailwind necesita inline en dev) — sin `eval` en producción.
5. **Cifrado de secretos**: claves API cifradas con **AES-256-GCM** (`node:crypto`, clave derivada de un secreto máquina + passphrase del usuario) en `SecretStore`; nunca en disco en claro.
6. **Path traversal / command injection**: toda ruta de usuario se normaliza (`path.resolve`), se valida contra la raíz permitida y se bloquean accesos fuera de ella; no se ejecutan comandos del sistema con entradas de usuario.
7. **SQL injection**: statements preparados (node:sqlite) en todos los repositorios; nunca concatenación de strings.
8. **XSS**: React escapa por defecto; se sanitizan textos HTML de documentos si se renderizan como HTML (no previsto; solo texto plano).
9. **Prototype pollution**: utilidades propias inmutables; entradas JSON del IPC validadas con Zod; `Object.freeze` en constantes.
10. **Logs seguros**: se redactan secretos/tokens en el logger (`redact: ['apiKey','authorization']`).
11. **Auditoría**: eventos de alto riesgo (importar claves, restaurar backups, mover archivos masivo) se registran en tabla `audit_log`.
12. **Firma de actualizaciones** y verificación de integridad (ADR-0008).

## Consecuencias
- El renderer jamás recibe el contenido de las claves; solo estados (configurado/no configurado).
- Todas las entradas de IPC pasan por `zod` schemas definidos en `packages/shared` (compartidos entre main y renderer).
- Revisión completa del modelo de amenazas en `security.md`.
