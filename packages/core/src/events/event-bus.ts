import type { EventBus, EventMap, EventName } from '@documind/domain'

type Handler<K extends EventName> = (payload: EventMap[K]) => void | Promise<void>

/**
 * Implementación del Event Bus. Los handlers son aislados: un error no
 * rompe la cadena de notificación.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventName, Set<Handler<EventName>>>()

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) {
      queueMicrotask(() => {
        void Promise.resolve(handler(payload as EventMap[EventName])).catch((error) => {
          console.error(`[bus] error en handler de "${event}":`, error)
        })
      })
    }
  }

  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as Handler<EventName>)
    return () => {
      this.handlers.get(event)?.delete(handler as Handler<EventName>)
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
