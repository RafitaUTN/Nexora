# ADR-0011 — Autenticación y usuarios multi-rol (Argon2, sesiones)

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
DocuMind es una app de escritorio local para PYMES que gestiona documentos personales y de clientes. Hasta ahora la app es monousuario y sin autenticación. Se quiere soportar varios usuarios con roles distintos (administrador, editor, lector) protegiendo el acceso local al contenido.

## Decisiones
1. **Hash de contraseñas con scrypt** (`node:crypto.scrypt`). Es un KDF *memory-hard* recomendado por OWASP como alternativa a Argon2id, está integrado en Node (sin dependencias nativas, por lo que funciona idéntico en el proceso principal de Electron y en los tests). Se guarda en un formato PHC propio (`$scrypt$N=…,r=…,p=…$salt$hash`). Se descartó `@node-rs/argon2` (NAPI): en este entorno (Node 24/win32) su `verify` no parsea ni su propio hash ni los vectores estándar (error `missing field`), y añadir un módulo nativo en Electron exige empaquetado y externalización adicionales. El `PasswordHasher` es un puerto, así que migrar a Argon2id más adelante solo implica cambiar la implementación.
2. **Roles**: `admin`, `editor`, `viewer`. La gestión de usuarios (crear, cambiar rol, eliminar) y el setup inicial requieren `admin`. `editor` puede operar sobre documentos (clasificar, etiquetar); `viewer` es solo lectura. La aplicación real de permisos se hace en los casos de uso (nunca solo ocultando UI).
3. **Sesiones por token opaco**. Al iniciar sesión se genera un token aleatorio de 256 bits (`crypto.randomBytes`); en la base solo se almacena su **SHA-256** (una filtración de la DB no expone sesiones válidas). La sesión tiene expiración (30 días por defecto) y se renueva con uso. El token crudo vive solo en el proceso principal (memoria o cifrado en `SecretStore`), nunca llega al renderer.
4. **Bootstrap sin usuarios**: si `users` está vacío, la app entra en modo "setup" y el primer usuario registrado es `admin`. `AuthService.setupAdmin()` solo se permite sin usuarios existentes.
5. **Puertos del dominio**: `PasswordHasher`, `SessionTokenService` (generación/hash de tokens), `UserRepository`, `SessionRepository`; `AuthService` es el caso de uso con toda la validación de roles. `@documind/domain` sigue sin dependencias de infraestructura.
6. **Migración versionada 005** con tablas `users` y `sessions` (mismo mecanismo `schema_migrations` existente).
7. **Auditoría**: login/logout fallidos, creación/borrado/cambio de rol se registran en `audit_log`.

## Consecuencias
- El renderer nunca ve contraseñas ni tokens; el proceso principal mantiene la sesión activa.
- El guard de roles se aplica en `AuthService` (dominio) y se refleja en la UI.
- Coste de cómputo de scrypt (por defecto N=2^15, r=8, p=1 ≈ 32 MiB) es aceptable en arranque/login; el hash es lento deliberadamente.
- Al migrar de monousuario: la app exige login solo cuando existen usuarios; si hay datos previos y ningún usuario, se crea el admin (sin romper datos existentes).

## Alternativas descartadas
- `@node-rs/argon2` / `argon2`: bindings nativos; el primero falló al verificar en este entorno y el segundo exige toolchain C++ + `electron-rebuild`.
- JWT: no hay necesidad de tokens sin estado; un token opaco con hash en DB es más simple y revocable.
