# ADR-0006 — IA multi-proveedor mediante interfaz `AIProvider`

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
El producto debe permitir clasificación, resumen, extracción de entidades, generación de etiquetas y búsqueda semántica, sin depender de un solo proveedor. El primer proveedor activo es **OpenRouter** (un único contrato para muchos modelos). Deben soportarse también OpenAI, Gemini, Claude y, offline, Ollama.

## Decisión
Definir un puerto único en `packages/domain` y su implementación en `packages/ai`:

```ts
export interface AIProvider {
  readonly id: ProviderId
  chat(req: ChatRequest): Promise<ChatResponse>        // texto
  chatStream?(req: ChatRequest): AsyncIterable<string> // para respuestas largas
  classify?(req): Promise<Classification>              // helpers opcionales
  getUsage(req): TokenUsage
}

export type ProviderId = 'openrouter' | 'openai' | 'gemini' | 'claude' | 'ollama'
```

- **Factory**: `createAIProvider(id, secrets) => AIProvider` (Strategy/Factory).
- **OpenRouter**: implementación HTTP directa con `fetch`, streaming, y soporte `models/` para elegir modelo por tarea (barato/rápido vs. preciso).
- **Rate limiting**: token bucket por proveedor; **presupuesto de tokens** por llamada (nunca se envía el documento completo; se envían fragmentos estratégicos: primeras páginas, encabezados, texto OCR truncado).
- **Caché**: respuestas de clasificación cacheadas por hash del contenido + parámetros (tabla `ai_cache`).
- **Registro de consumo**: tabla `ai_usage` (tokens, modelo, coste estimado, latencia).

## Consecuencias
- El dominio nunca importa un SDK concreto; solo la interfaz.
- Agregar un proveedor = implementar el contrato en `packages/ai/providers/` y registrarlo en la factoría (abierto/cerrado).
- Offline total: las operaciones de IA se degradan con mensaje claro y no bloquean la indexación local.
