import { describe, expect, it } from 'vitest'
import { SettingsService } from './settings-service'
import { FakeSettingsRepository } from '../test/fakes'

describe('SettingsService', () => {
  it('devuelve los valores por defecto si no hay nada guardado', async () => {
    const service = new SettingsService(new FakeSettingsRepository())
    const settings = await service.get()
    expect(settings.ai.tokenBudget).toBe(8_000)
    expect(settings.ai.provider).toBeNull()
    expect(settings.updates.autoCheck).toBe(true)
    expect(settings.theme).toBe('system')
  })

  it('persiste un parche validando con Zod', async () => {
    const repo = new FakeSettingsRepository()
    const service = new SettingsService(repo)
    const updated = await service.update({ ai: { provider: 'ollama', model: 'llama3.2' } })
    expect(updated.ai.provider).toBe('ollama')
    expect(updated.ai.tokenBudget).toBe(8_000)
    const reloaded = await service.get()
    expect(reloaded.ai.provider).toBe('ollama')
  })

  it('fusiona parches anidados sin pisar el resto de ai/updates', async () => {
    const service = new SettingsService(new FakeSettingsRepository())
    await service.update({ ai: { provider: 'ollama', model: 'llama3.2' } })
    const updated = await service.update({ ai: { model: 'gemma2' } })
    expect(updated.ai.provider).toBe('ollama')
    expect(updated.ai.model).toBe('gemma2')
    expect(updated.ai.tokenBudget).toBe(8_000)
  })

  it('rechaza valores fuera de rango (tokenBudget inválido)', async () => {
    const service = new SettingsService(new FakeSettingsRepository())
    await expect(service.update({ ai: { tokenBudget: 50 } })).rejects.toThrow()
  })

  it('vuelve a los valores por defecto si el JSON guardado está corrupto', async () => {
    const repo = new FakeSettingsRepository()
    await repo.set('app.settings', '{no-json')
    const service = new SettingsService(repo)
    const settings = await service.get()
    expect(settings.ai.tokenBudget).toBe(8_000)
  })
})
