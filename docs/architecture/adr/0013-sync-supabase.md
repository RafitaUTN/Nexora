# ADR-0013 — Sincronización entre dispositivos con Supabase/Postgres

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
DocuMind es una app de escritorio con SQLite local (FTS5). El usuario quiere usar la
misma biblioteca (documentos, etiquetas y asignaciones) en varios dispositivos sin
migrar a un modelo completamente online. Se necesita un mecanismo de sincronización
entre instalaciones que: 1) funcione con los datos locales como fuente de verdad
(LWW), 2) no dependa de un servidor propio (usa Supabase/Postgres como backend
gestionado), 3) propague borrados como tombstones y 4) siga funcionando offline.

## Decisiones
1. **Sincronización LWW (last-write-wins) por `updatedAtMs`**. Cada cambio lleva un
   `updatedAtMs` monotónico (ms desde epoch). Al aplicar un cambio remoto se descarta
   si el estado local es más reciente o igual (`local >= remoto`). El reloj es el del
   dispositivo; en el peor caso se pierde un cambio concurrente, aceptado como
   compromiso de simplicidad frente a CRDTs/Lamport.
2. **Outbox local llenado por triggers SQLite** (migración 007). `INSERT/UPDATE/DELETE`
   en `documents`, `tags`, `document_tags` y `document_contents` insertan en
   `sync_outbox (entity, entity_key, op, updated_at_ms, synced)`. Así cualquier
   escritura existente del dominio queda registrada **sin tocar los repositorios**.
3. **Borrados como tombstones, nunca DELETE**. La fila remota solo actualiza
   `deleted_at_ms` (y `updated_at_ms`); los demás dispositivos pueden detectar la
   eliminación. Localmente el borrado aplica la marca y la fila se mantiene hasta una
   purga futura.
4. **Claves compuestas `entity:entityKey`** (`keyOf` en `SyncService`): los IDs
   locales colisionan entre dispositivos, así que el remoto se identifica por
   `(device_id, local_id)` y las asignaciones por `(device_id, document_id, tag_id)`.
   `sync_meta` mapea los IDs remotos al ID local real.
5. **Tablas remotas `public.sync_documents`, `public.sync_tags`,
   `public.sync_document_tags` y `public.sync_meta`** creadas en el proyecto Supabase
   `jhxczeottwfmxuohdwqd` (plan free, región us-east-1). La configuración persiste en
   `settings` (clave `sync.settings`) con `enabled`, `url`, `anonKey`, `email` y
   `lastPullMs`. La `anonKey` es publicable por diseño.
6. **`SyncService` en el dominio** con puertos `SyncLocalStore` / `SyncRemoteStore`:
   `sync()` sube los pendientes (UPSERT con `Prefer: resolution=merge-duplicates`),
   trae los cambios de otros dispositivos posteriores a `lastPullMs`, los aplica con
   LWW y avanza `lastPullMs`. Idempotente, `ping()`, `status()`, `setEnabled()` y
   `configure(url, anonKey, email)`. `status()` expone `authenticated`/`email`.
7. **Implementaciones en `@documind/core`**: `SqliteSyncLocalStore` (lee outbox,
   reconstruye payloads, aplica remotos, mapea `sync_meta`) y `SupabaseSyncStore`
   (PostgREST con `fetch` únicamente; `fetchImpl` inyectable para tests).
8. **Integración Electron**: canales `sync:status|setEnabled|configure|run|ping`;
   `status`/`ping` de solo lectura (viewer), `run` editor, `configure`/`setEnabled`
   admin con auditoría. El store remoto se reconstruye con la configuración vigente
   en cada operación.
9. **UI**: sección «Sincronización» en Ajustes (URL, anonKey, toggle, probar conexión,
   sincronizar ahora, contador de pendientes, conectar cuenta por correo/contraseña).
10. **Autenticación por usuario (Supabase Auth)**. `SupabaseAuthClient` en
    `@documind/core` implementa `login`, `refresh` y `signUp` contra GoTrue
    (`/auth/v1/token|signup`) con `fetch`. La sesión (`access_token`, `refresh_token`,
    `expiresAt`, `userId`, `email`) se guarda **cifrada en el `SecretStore`**, nunca en
    la configuración. El runtime refresca automáticamente el token cuando queda menos
    de 60 s de vida. `SupabaseSyncStore` envía el `access_token` como `Bearer` y
    escribe la columna `user_id` en cada fila.
11. **RLS por `auth.uid()`** en las 4 tablas remotas (migración `rls_user_scoped_sync`):
    columna `user_id uuid not null default auth.uid()` e índice por `user_id`; se
    reemplazan las políticas permisivas `anon` por políticas `sync_*_own` con
    `using (user_id = auth.uid()) with check (user_id = auth.uid())`. Sin sesión las
    escrituras se rechazan (el `WITH CHECK` falla con `user_id = null`).
12. **Auto-sync en segundo plano** (`runAutoSync` en el runtime): primer disparo a los
    5 s tras arrancar y luego cada 15 min; solo si hay configuración válida; el
    resultado se reenvía al renderer como `sync:status` para invalidar la UI. No
    bloquea el arranque ni propaga errores fuera del ciclo.

## Consecuencias
- La sincronización **manual** (botón «Sincronizar ahora») y en **segundo plano** cada
  15 minutos mientras haya configuración válida.
- Los datos remotos quedan **aislados por usuario**: cada fila pertenece a un
  `user_id` y las políticas `sync_*_own` limitan lectura/escritura a `auth.uid()`.
  Sin iniciar sesión, `push`/`pull` fallan con `ERR_SYNC_REMOTE` (RLS deniega).
- La sesión vive cifrada en disco y se renueva de forma transparente; el correo se
  guarda en claro en la configuración para la UI, pero nunca las credenciales.
- La app funciona sin red: solo el ciclo de sync requiere conexión.
- Los triggers del outbox añaden una escritura extra por mutación en las tablas
  implicadas (coste despreciable en volúmenes de escritorio).
- La app funciona sin red: solo el ciclo de sync requiere conexión.
- Los triggers del outbox añaden una escritura extra por mutación en las tablas
  implicadas (coste despreciable en volúmenes de escritorio).

## Alternativas descartadas
- **CRDTs** (Yjs/Automerge): resuelven conflictos mejor que LWW pero añaden
  dependencias y complejidad no justificada para un solo escritor por documento.
- **Servidor propio**: Supabase aporta PostgREST + hosting gestionado sin infra.
- **Sincronizar la DB completa por fichero**: no escala a pocas filas ni detecta
  borrados de otros dispositivos sin conflicto de archivo.
