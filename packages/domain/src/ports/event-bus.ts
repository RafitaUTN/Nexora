import type { DocumentStatus } from '../entities/document'

export interface EventMap {
  'document:added': { documentId: number }
  'document:indexed': { documentId: number }
  'document:classified': { documentId: number }
  'document:status': { documentId: number; status: DocumentStatus }
  'index:progress': { processed: number; total: number }
  'ocr:progress': { processed: number; total: number }
  'ai:progress': { task: string; processed: number; total: number }
  'automation:run': { automationId: number; documentId: number; ok: boolean }
  'sync:completed': { pushed: number; pulled: number; applied: number; skipped: number }
  notification: {
    level: 'info' | 'success' | 'warning' | 'error'
    title: string
    body?: string
  }
}

export type EventName = keyof EventMap

/**
 * Event Bus tipado (Observer). Único mecanismo de acoplamiento entre módulos.
 */
export interface EventBus {
  emit<K extends EventName>(event: K, payload: EventMap[K]): void
  on<K extends EventName>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>,
  ): () => void
  clear(): void
}
