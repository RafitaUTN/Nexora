import { describe, expect, it } from 'vitest'
import { TokenBucket } from './rate-limiter'

describe('TokenBucket', () => {
  it('permite consumir hasta la capacidad', () => {
    const bucket = new TokenBucket(3, 1)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(false)
  })

  it('no consume si no hay presupuesto para el lote', () => {
    const bucket = new TokenBucket(2, 1)
    expect(bucket.tryConsume(3)).toBe(false)
    expect(bucket.tryConsume(2)).toBe(true)
  })

  it('se recarga con el tiempo', async () => {
    const bucket = new TokenBucket(1, 10)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 110))
    expect(bucket.tryConsume()).toBe(true)
  })

  it('nunca supera la capacidad tras recargar', async () => {
    const bucket = new TokenBucket(2, 10)
    expect(bucket.tryConsume()).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 110))
    expect(bucket.tryConsume(5)).toBe(false)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(false)
  })
})
