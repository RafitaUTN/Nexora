# ADR-0005 — Event Bus tipado como desacoplamiento

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
Módulos independientes (OCR, indexador, watcher, UI, automatizaciones) necesitan reaccionar entre sí sin acoplarse directamente.

## Decisión
Implementar un **Event Bus tipado** en `packages/core` (patrón Observer/mediator):

```ts
bus.emit('document:indexed', { id, path })
bus.on('document:indexed', async ({ id }) => { /* clasificar por regla */ })
```

Reglas:
- Los eventos son estructuras de datos inmutables y tipadas (`EventMap`).
- Los suscriptores son `async` y sus errores se capturan de forma aislada (un fallo no rompe la cadena).
- Los eventos de progreso (OCR, indexación) se propagan al renderer mediante IPC unidireccional.
- No se usa como reemplazo del retorno de funciones: solo para notificación de hechos ocurridos.

## Consecuencias
- El renderer se suscribe a eventos de progreso vía preload (canal `events:`).
- Facilita "automatizaciones" (reglas reaccionan a eventos de dominio) sin acoplar módulos.
