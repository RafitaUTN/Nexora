# Arquitectura — Visión general

## 1. Contexto del sistema

DocuMind Desktop es una aplicación de escritorio para Windows/Linux/macOS que clasifica, indexa y permite buscar documentos mediante IA. El 100% de los datos vive en el equipo del usuario (SQLite local); la IA es opcional y puede operar sin conexión (funcionalidad básica) o conectada (clasificación, resúmenes, búsqueda semántica).

```mermaid
graph LR
    U[Usuario] --> A[DocuMind Desktop]
    A --> FS[Carpetas del usuario]
    A --> DB[(SQLite local)]
    A --> OCR[Tesseract OCR]
    A --> AI[Proveedor IA<br/>OpenRouter / OpenAI / Gemini / Claude / Ollama]
    A --> UP[Servidor de actualizaciones<br/>GitHub Releases]
```

## 2. Vistas de proceso (C4 — nivel 1 y 2)

### 2.1 Contenedores

```mermaid
graph TB
    subgraph Aplicación Electron
        MAIN[Proceso principal<br/>Node.js 22+, Clean Architecture]
        PRE[Preload<br/>puente IPC tipado]
        RND[Renders React<br/>UI]
    end
    MAIN --> DB[(SQLite<br/>node:sqlite + FTS5)]
    MAIN --> FS2[Filesystem<br/>escaneo/OCR/indexado]
    RND <-->|IPC sobre canales allowlist| PRE <-->|contextBridge| MAIN
```

- **Proceso principal**: servicios de dominio, repositorios, OCR, IA, watchers, respaldos, actualizaciones. Nunca accesible desde el renderer excepto por canales IPC explícitos.
- **Preload**: expone una API tipada y mínima mediante `contextBridge`; valida y restringe cada canal.
- **Renderer**: React, sin acceso a Node ni al filesystem. Recibe eventos de progreso vía IPC.

### 2.2 Capas del proceso principal (Clean Architecture)

```mermaid
graph TB
    subgraph Capa Aplicación
        USE[Casos de uso<br/>packages/domain]
    end
    subgraph Capa Dominio
        ENT[Entidades + Value Objects]
        PORTS[Puertos: repositorios, AIProvider, OCREngine, Watcher]
    end
    subgraph Capa Infraestructura
        CORE[packages/core: config, DB, eventos, logging, DI]
        AI[packages/ai: adaptadores IA]
        OCR[packages/ocr: Tesseract + workers]
        DOC[packages/document: extractores PDF/Word/Excel/img]
        APP[apps/desktop: composición + IPC + UI]
    end
    USE --> ENT
    USE --> PORTS
    PORTS -->|implementado por| CORE
    PORTS -->|implementado por| AI
    PORTS -->|implementado por| OCR
    PORTS -->|implementado por| DOC
    APP --> CORE
```

Reglas de dependencia: la capa de dominio no importa nada de infraestructura. La inversión de dependencias se resuelve con un contenedor DI sencillo (composition root en el proceso principal).

## 3. Modelo de módulos funcionales

Cada módulo es independiente, comunica solo mediante el Event Bus y expone casos de uso.

| Módulo | Responsabilidad | Estado |
|---|---|---|
| Dashboard | Métricas y actividad reciente | Fase 5 |
| Documentos | CRUD, versionado, historial, deduplicación | Fase 3 |
| Búsquedas | FTS5 + búsqueda semántica (IA) | Fase 3 |
| OCR | Extracción de texto de imágenes/PDF escaneados | Fase 3 |
| IA | Clasificación, resumen, extracción de entidades, Q&A | Fase 3 |
| Clasificación | Reglas + clasificación por IA, etiquetas automáticas | Fase 3 |
| Etiquetas | Gestión de etiquetas inteligentes | Fase 3 |
| Respaldos | Backup/restore de la base y configuración | Fase 4 |
| Automatizaciones | Reglas: mover, renombrar, etiquetar | Fase 4 |
| Historial | Historial de cambios y auditoría | Fase 3 |
| Configuración | Preferencias, proveedor IA, claves cifradas | Fase 4 |
| Usuarios (futuro) | Multi-usuario, Argon2, roles | Post-MVP |
| Licencias | Gratuita / Pro / Empresarial (preparado, sin pagos) | Fase 6 |
| Actualizaciones | Auto-update firmado y rollback | Fase 6 |
| Logs/Diagnóstico | Logs seguros, health checks | Fase 4 |

## 4. Flujo principal: escaneo → extracción → OCR → IA → indexado

```mermaid
sequenceDiagram
    participant W as FileWatcher
    participant Q as Cola de ingesta
    participant E as Extractor
    participant O as OCREngine
    participant AI as AIProvider
    participant DB as SQLite
    W->>Q: nuevo/último archivo (hash)
    Q->>E: lotes
    E->>DB: metadata + hash + dedupe
    alt requiere OCR
        E->>O: imagen/PDF escaneado
        O-->>E: texto + confianza
    end
    E-->>AI: texto (truncado + presupuesto tokens)
    AI-->>E: clasificación, etiquetas, entidades
    E->>DB: índice FTS5 + metadatos IA (cacheado)
    Q->>W: siguiente lote
```

## 5. Comunicación (Event Bus)

```mermaid
graph LR
    MOD1[Módulo A] -->|emite evento| BUS[Event Bus<br/>tipado + async]
    BUS -->|suscribe| MOD2[Módulo B]
    BUS -->|suscribe| MOD3[UI vía IPC]
```

El Event Bus es el único mecanismo de desacoplamiento entre módulos (patrón Observer). Los eventos de progreso se reenvían al renderer por IPC de solo-envío (`webContents.send`), nunca request/response para eventos de volumen.

## 6. Decisiones de alto nivel

1. **Electron sobre Tauri**: ecosistema maduro, Node para worker_threads/Tesseract y `node:sqlite` built-in, tooling electron-vite/electron-builder sólido. Se documenta en ADR-0001.
2. **SQLite + FTS5**: capacidad real de 1M+ filas indexadas con queries preparadas y escrituras en lotes; capa Repository permite migrar a Postgres/Supabase (ADR-0004).
3. **IA desacoplada**: interfaz `AIProvider` + factoría por proveedor; OpenRouter como primer proveedor (ADR-0006).
4. **Actualizaciones**: electron-updater con NSIS diferencial y verificación de firma (ADR-0008).
