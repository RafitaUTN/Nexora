# Rendimiento y escalabilidad

Objetivo: **+1M documentos indexados**, **+500 GB analizados**, miles de carpetas, OCR en segundo plano, sin bloquear la UI.

## 1. Estrategia de ingestión

- **Watcher** (chokidar) con debounce agrupado por raíz; los eventos se convierten en *jobs* en una **cola** (tabla `ocr_queue`/cola en memoria) procesada por **lotes** (p. ej. 200 docs/lote, commits cada N).
- **Indexación incremental**: se compara `hash + mtime + size`; si no cambió, se omite (no re-extraer, no re-OCR, no re-IA).
- **Hashing** streaming (chunked `sha256`) para no cargar archivos grandes en memoria.
- **Worker threads** para OCR (pool 2–4, según CPU). La extracción de texto es ligera (pdf-parse/mammoth/xlsx) y corre en el main con `setImmediate`/lotes, o en workers si se detecta presión.

## 2. Base de datos

- **WAL + synchronous=NORMAL + foreign_keys=ON + busy_timeout**.
- **Escritura single-writer**: una cola interna serializa INSERT/UPDATE (better-sqlite3 ya es síncrono y atómico por statement; los lotes se envuelven en transacciones explícitas).
- **Prepared statements** reutilizados (cache de statements) — nunca compilar SQL por invocación.
- **Sin N+1**: los repositorios ofrecen consultas por lotes (batch get por ids, join de tags con `GROUP_CONCAT`, eager loading). Los casos de uso no iteran para hacer queries por fila.
- **FTS5 external content**: el texto vive en `document_contents`; FTS solo índices, sin duplicar almacenamiento (~igual que el texto, no ×3).
- **Índices** cubren: status, hash, ext, mtime, source, tags, entities, created_at (ver `data-model.md`).
- Consultas de listado con **paginación por cursor** (id/updated_at) en lugar de `OFFSET` para tablas grandes.

## 3. Memoria y CPU

- Extracción de imágenes: `sharp` redimensiona antes de OCR (páginas >300 DPI → 300 DPI máx.) para limitar RAM.
- El texto para IA se **trunca por presupuesto de tokens** (por defecto ~8k tokens) y se cachea (`ai_cache`).
- Cache LRU en memoria para respuestas de IA + consultas FTS frecuentes.
- Los resultados de OCR/IA se almacenan para no repetir trabajo (idempotencia por hash).

## 4. UI

- **Virtualización** de tablas y grids (TanStack Virtual) para listar decenas de miles de filas.
- **Lazy loading** de rutas (React.lazy) y de vistas pesadas (vista OCR, IA).
- TanStack Query con `staleTime` e invalidación dirigida; no refetch global.
- Los eventos de progreso se **throttlean** (máx. ~10/s por canal) para no saturar IPC.

## 5. Escala (referencias)

| Métrica | Objetivo | Técnica |
|---|---|---|
| 1M documentos | listados < 100 ms | paginación por cursor + índices + FTS |
| Búsqueda full-text | < 50 ms | FTS5 porter/unicode61 |
| OCR 500 GB | throughput ~2–5 páginas/s/worker | pool de workers + cola + caché |
| Ingesta inicial 100k archivos | < 1 h (texto) | lotes + incremental |
