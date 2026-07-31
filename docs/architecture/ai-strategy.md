# Estrategia de IA

## 1. Arquitectura

Interfaz única `AIProvider` (ADR-0006). Primer proveedor: **OpenRouter**. Modelos por tarea (configurables):

| Tarea | Modelo sugerido (OpenRouter) | Nota |
|---|---|---|
| Clasificación | `openai/gpt-4o-mini` o `google/gemini-2.0-flash` | bajo coste, JSON estricto |
| Resumen | `openai/gpt-4o-mini` | límite de tokens del resumen configurable |
| Extracción de entidades | `openai/gpt-4o-mini` | salida JSON: person, org, email, invoice, amount, date, iban |
| Etiquetas inteligentes | `openai/gpt-4o-mini` | propone 1–5 etiquetas del vocabulario existente |
| Q&A / búsqueda semántica | `openai/gpt-4o-mini` | RAG local: FTS5 devuelve candidatos → IA responde citando fragmentos |

## 2. Optimización de costos

1. **Fragmentos, no documentos completos**: se envía título + primeras N páginas/caracteres + texto OCR truncado según presupuesto de tokens.
2. **Caché de respuestas** (`ai_cache`, hash de prompt+params+modelo, TTL configurable). Clasificaciones idénticas → cache hit (se registra `cached=1`).
3. **Rate limiting**: token bucket por proveedor (llamadas/seg y tokens/min); ante 429 se aplica backoff exponencial y se reencola.
4. **Elección de modelo por tarea**: las tareas baratas nunca usan el modelo caro.
5. **Fallback**: si un proveedor falla, se intenta el siguiente en la cadena configurada; si todos fallan y hay red, se deja la cola para reintento; sin red, la indexación local sigue igual.
6. **Registro de consumo** (`ai_usage`): tokens, modelo, latencia y coste estimado (tabla de precios editable en Configuración → IA).

## 3. Privacidad y seguridad

- Nunca se envían documentos completos salvo acción explícita del usuario (config. `settings.ai.sendWholeDocument` = false por defecto).
- El usuario puede desactivar la IA por completo (offline-first).
- Las claves de proveedor se cifran (ADR-0009).
- Anonimización opcional: extraer solo fragmentos sin datos personales según política configurable (fase futura).

## 4. Q&A con RAG local

```
query → FTS5 (title/content) → top-k fragmentos con score
     → prompt (contexto + pregunta) → IA → respuesta + citas (doc_id, score)
```

La respuesta se cachea por `hash(question + top-k ids)`.
