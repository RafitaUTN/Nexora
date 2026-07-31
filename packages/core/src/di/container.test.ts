import { describe, expect, it } from 'vitest'
import { Container, toAppError } from './container'
import type { AppError } from '@documind/shared'

describe('Container', () => {
  it('registra y resuelve dependencias', () => {
    const container = new Container()
    container.register('str', () => 'hola')
    expect(container.resolve<string>('str')).toBe('hola')
    expect(container.has('str')).toBe(true)
    expect(container.has('nope')).toBe(false)
  })

  it('resolver lanza si el token no está registrado', () => {
    const container = new Container()
    expect(() => container.resolve('missing')).toThrow('Dependencia no registrada: missing')
  })

  it('registerSingleton mantiene una única instancia', () => {
    const container = new Container()
    let calls = 0
    container.registerSingleton('dep', () => {
      calls += 1
      return { n: calls }
    })
    const a = container.resolve<{ n: number }>('dep')
    const b = container.resolve<{ n: number }>('dep')
    expect(a).toBe(b)
    expect(a.n).toBe(1)
    expect(calls).toBe(1)
  })

  it('clear elimina registros e instancias', () => {
    const container = new Container()
    container.registerSingleton('dep', () => ({ x: 1 }))
    container.resolve('dep')
    container.clear()
    expect(container.has('dep')).toBe(false)
    expect(() => container.resolve('dep')).toThrow()
  })

  it('toAppError preserva AppError y envuelve desconocidos', () => {
    const known = { code: 'ERR_FOO', message: 'x' } as AppError
    expect(toAppError(known)).toBe(known)
    expect(toAppError(new Error('boom'))).toEqual({ code: 'ERR_UNKNOWN', message: 'boom' })
    expect(toAppError(42)).toEqual({ code: 'ERR_UNKNOWN', message: '42' })
  })
})
