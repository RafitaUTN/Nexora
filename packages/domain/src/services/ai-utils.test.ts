import { describe, expect, it } from 'vitest'
import { estimateCost, parseJson, requestHash } from './ai-utils'

describe('requestHash', () => {
  it('es estable para el mismo modelo y mensajes', () => {
    const messages = [{ role: 'user', content: 'hola' }]
    expect(requestHash('gpt', messages)).toBe(requestHash('gpt', messages))
  })

  it('cambia con el modelo o los mensajes', () => {
    expect(requestHash('gpt', [])).not.toBe(requestHash('claude', []))
  })
})

describe('estimateCost', () => {
  it('usa tarifas mini para modelos con «mini»', () => {
    const cost = estimateCost('openai/gpt-4o-mini', { promptTokens: 1_000_000, completionTokens: 1_000_000 })
    expect(cost).toBeCloseTo(0.75)
  })

  it('usa tarifas estándar para el resto', () => {
    const cost = estimateCost('openai/gpt-4o', { promptTokens: 1_000_000, completionTokens: 1_000_000 })
    expect(cost).toBeCloseTo(4.0)
  })
})

describe('parseJson', () => {
  it('parsea JSON plano', () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })

  it('tolera bloques markdown con y sin lenguaje', () => {
    expect(parseJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJson<{ a: number }>('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('devuelve null para contenido no JSON', () => {
    expect(parseJson('hola')).toBeNull()
  })
})
