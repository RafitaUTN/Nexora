import { describe, expect, it, vi } from 'vitest'
import { ConsoleLogger } from './logger'

describe('ConsoleLogger', () => {
  it('filtra por nivel (info no imprime debug)', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const logger = new ConsoleLogger('info')
    logger.debug('no debería salir')
    logger.info('sí sale')
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0])).toContain('sí sale')
    log.mockRestore()
  })

  it('redacta claves sensibles anidadas', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const logger = new ConsoleLogger('info')
    logger.info('clasificar', {
      provider: 'openai',
      auth: { apiKey: 'sk-secret', authorization: 'Bearer abc' },
      tags: ['ok', { password: 'pwd' }],
      innocuous: 42,
    })
    const line = String(log.mock.calls[0]?.[0] ?? '')
    const parsed = JSON.parse(line)
    expect(parsed.auth.apiKey).toBe('[REDACTED]')
    expect(parsed.auth.authorization).toBe('[REDACTED]')
    expect(parsed.tags[1].password).toBe('[REDACTED]')
    expect(parsed.innocuous).toBe(42)
    expect(line).not.toContain('sk-secret')
    log.mockRestore()
  })

  it('error incluye el stack en el campo error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const logger = new ConsoleLogger('info')
    const error = new Error('fallo')
    logger.error('algo falló', {}, error)
    const parsed = JSON.parse(String(err.mock.calls[0]?.[0] ?? ''))
    expect(parsed.level).toBe('error')
    expect(parsed.error).toContain('fallo')
    err.mockRestore()
  })
})
