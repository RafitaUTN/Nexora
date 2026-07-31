import { describe, expect, it } from 'vitest'
import { paged } from './document'

describe('paged', () => {
  it('corta los items cuando sobran más que el límite', () => {
    const result = paged([{ id: 1 }, { id: 2 }, { id: 3 }], 2)
    expect(result.items.map((i) => i.id)).toEqual([1, 2])
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe(2)
  })

  it('devuelve todo cuando no sobra nada y nextCursor null si la lista está vacía', () => {
    const result = paged([{ id: 1 }, { id: 2 }], 2)
    expect(result.items.map((i) => i.id)).toEqual([1, 2])
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBe(2)
    expect(paged([], 5)).toEqual({ items: [], nextCursor: null, hasMore: false })
  })
})
