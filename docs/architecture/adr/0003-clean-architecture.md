# ADR-0003 — Clean Architecture + puertos y adaptadores

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
El dominio (documentos, clasificación, etiquetas, auditoría) debe ser estable e independiente de los detalles: SQLite vs Postgres, Tesseract vs OCR cloud, proveedor IA, filesystem.

## Decisión
Aplicar Clean Architecture con dependencias invertidas:

- **Dominio** (`packages/domain`): entidades, value objects, casos de uso, y **puertos** (interfaces) `DocumentRepository`, `IndexRepository`, `AIProvider`, `OCREngine`, `FileWatcher`, `EventBus`, `SecretStore`.
- **Infraestructura** (`packages/core`, `ai`, `ocr`, `document`, `apps/desktop`): implementa los puertos.
- **Composition Root** en el proceso principal: el contenedor DI registra los adaptadores concretos contra los puertos.

Ejemplo de inversión:

```ts
// domain — puerto
export interface DocumentRepository {
  save(doc: Document): Promise<DocumentId>
}
// core/infra — adaptador
export class SqliteDocumentRepository implements DocumentRepository { /* node:sqlite */ }
```

## Consecuencias
- Migrar a Postgres/Supabase = nuevo adaptador `PostgresDocumentRepository`, cero cambios en casos de uso.
- Cambiar de proveedor IA = nuevo adaptador en `packages/ai`.
- El testing del dominio usa fakes de los puertos (tests sin DB ni disco).

Se aplica **YAGNI**: no se introduce CQRS (las lecturas y escrituras comparten el mismo modelo y la complejidad no lo justifica); el Event Bus cubre la consistencia eventual de bajo acoplamiento.
