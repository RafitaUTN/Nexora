# ADR-0012 — Licencias online con verificación offline por firma digital

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
DocuMind quiere monetizar funcionalidades avanzadas mediante planes (Gratuita / Pro / Empresa). La tabla `licenses` y la entidad `License` ya existen como estructura pero no hay lógica. Se necesita: activar una clave online, verificar la licencia **sin conexión** (la app es de escritorio y debe seguir funcionando offline) e impedir que un usuario manipule la licencia local o que un servidor comprometido emita licencias no autorizadas.

## Decisiones
1. **Esquema de firma Ed25519**. El servidor de licencias firma una carga JSON (`LicensePayload`: `keySha256`, `tier`, `deviceId`, `activatedAt`, `expiresAt`, `maxDevices`) con su clave privada; la aplicación conserva únicamente la **clave pública** embebida (`CryptoLicenseVerifier`) y verifica la firma localmente con `node:crypto`. Un servidor comprometido no puede fabricar licencias válidas sin la privada, y manipular la fila en la DB local invalida la firma.
2. **Firma determinista**: el payload se serializa con `canonicalJson` (claves ordenadas) para que la verificación no dependa del orden de las claves.
3. **La clave de licencia nunca se almacena**: solo su **SHA-256** (`keySha256`) viaja en la carga firmada y en la DB, como con los tokens de sesión (ADR-0011). En el servidor, la clave se liga a un `deviceId` (identificador de instalación estable persistido en `device.id`).
4. **Flujo de activación**: `POST /v1/licenses/activate { key, deviceId }` → `{ payload, signature }`. El cliente valida que `payload.deviceId === deviceId` local, verifica la firma y la expiración, y persiste. La desactivación es `POST /v1/licenses/deactivate { deviceId }` (best-effort: si el servidor no responde, se revoca igualmente en local).
5. **Re-evaluación en cada consulta**: `status()`/`isEntitled()` re-verifican la firma y la fecha de expiración; no hay estado "cached" que caduque mal. `expiresAt` vacío = licencia perpetua.
6. **Nuevos puertos del dominio**: `LicenseRepository`, `LicenseServer` (transporte online), `LicenseVerifier` (firma offline); `LicenseService` es el caso de uso con toda la lógica. `@documind/domain` sigue sin dependencias de infraestructura.
7. **Implementaciones en `@documind/core`**: `SqliteLicenseRepository` (fila fija id=1), `CryptoLicenseVerifier` (Ed25519), `HttpLicenseServer` (fetch global con timeout; errores HTTP mapeados a `LicenseError` con códigos de negocio). La URL del servidor es configurable vía `DOCUMIND_LICENSE_URL`, con un valor por defecto no enrutable (`*.invalid`).
8. **Migración 006**: `ALTER TABLE licenses` añade `key_sha256`, `signature` y `max_devices`.
9. **IPC y UI**: canales `license:status|activate|deactivate`; `activate`/`deactivate` exigen rol `admin` (guard en el proceso principal), `status` es de solo lectura. Sección «Licencia» en Ajustes con estado, activación y desactivación. Auditoría de activación/desactivación en `audit_log`.
10. **Clave pública placeholder**: la clave pública embebida por defecto es de desarrollo; en producción se sustituye por la del servidor real sin cambios de código.

## Consecuencias
- La app funciona offline: la licencia activada se valida localmente (firma + expiración) sin red.
- El servidor no necesita estado de "última comprobación": la expiración va en la carga firmada.
- La clave pública embebida no es un secreto; la privada vive solo en el servidor.
- El `LicenseService` acepta un reloj inyectable (`now`) para tests deterministas.

## Alternativas descartadas
- **Clave simétrica (HMAC)**: requeriría compartir un secreto con todos los clientes; cualquier extracción permitiría forjar licencias.
- **Verificación online en cada arranque**: rompe el uso offline y añade dependencia de disponibilidad del servidor.
- **Licencia sin firma (solo fila en DB)**: trivialmente manipulable.
