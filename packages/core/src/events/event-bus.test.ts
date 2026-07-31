import { describe, expect, it, vi } from 'vitest'
import { InMemoryEventBus } from './event-bus'

describe('InMemoryEventBus', () => {
  it('notifica a los handlers suscritos', async () => {
    const bus = new InMemoryEventBus()
    const handler = vi.fn()
    bus.on('document:added', handler)
    bus.emit('document:added', { documentId: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handler).toHaveBeenCalledWith({ documentId: 1 })
  })

  it('una suscripción devuelta desuscribe', () => {
    const bus = new InMemoryEventBus()
    const handler = vi.fn()
    const unsubscribe = bus.on('notification', handler)
    unsubscribe()
    bus.emit('notification', { level: 'info', title: 'x' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('un error en un handler no rompe los demás', async () => {
    const bus = new InMemoryEventBus()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    const ok = vi.fn()
    bus.on('document:indexed', broken)
    bus.on('document:indexed', ok)
    bus.emit('document:indexed', { documentId: 1 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ok).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('clear elimina todos los handlers', () => {
    const bus = new InMemoryEventBus()
    const handler = vi.fn()
    bus.on('document:added', handler)
    bus.clear()
    bus.emit('document:added', { documentId: 1 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('emite sin handlers sin error', () => {
    const bus = new InMemoryEventBus()
    expect(() => bus.emit('ocr:progress', { processed: 1, total: 2 })).not.toThrow()
  })
})
