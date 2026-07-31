import { describe, expect, it } from 'vitest'
import { AutomationService, type AutomationActions } from './automation-service'
import { FakeAutomationRepository, FakeEventBus } from '../test/fakes'

describe('AutomationService', () => {
  it('solo ejecuta automatizaciones habilitadas del trigger correcto', async () => {
    const repo = new FakeAutomationRepository()
    const bus = new FakeEventBus()
    const service = new AutomationService(repo, bus)
    const matching = await service.create({
      name: 'Etiquetar',
      enabled: true,
      triggerType: 'document:indexed',
      action: { type: 'tag', tagNames: ['nuevo'] },
    })
    await service.create({
      name: 'Deshabilitada',
      enabled: false,
      triggerType: 'document:indexed',
      action: { type: 'classify' },
    })
    await service.create({
      name: 'Otro trigger',
      enabled: true,
      triggerType: 'document:classified',
      action: { type: 'classify' },
    })

    const calls: string[] = []
    const actions: AutomationActions = {
      async tag(documentId, tags) {
        calls.push(`tag:${documentId}:${tags.join(',')}`)
      },
      async classify() {
        calls.push('classify')
      },
    }

    await service.runForTrigger('document:indexed', 7, actions)
    expect(calls).toEqual(['tag:7:nuevo'])
    expect(repo.runs).toHaveLength(1)
    expect(repo.runs[0]).toMatchObject({ automationId: matching.id, ok: true })
    expect(bus.eventsOf('automation:run')[0]).toMatchObject({ automationId: matching.id, ok: true })
  })

  it('registra fallo y emite evento con ok=false si la acción lanza', async () => {
    const repo = new FakeAutomationRepository()
    const bus = new FakeEventBus()
    const service = new AutomationService(repo, bus)
    const automation = await service.create({
      name: 'Clasificar',
      enabled: true,
      triggerType: 'document:indexed',
      action: { type: 'classify' },
    })
    const actions: AutomationActions = {
      async tag() {},
      async classify() {
        throw new Error('provider caído')
      },
    }
    await service.runForTrigger('document:indexed', 3, actions)
    expect(repo.runs[0]).toMatchObject({ automationId: automation.id, ok: false, detail: 'provider caído' })
    expect(bus.eventsOf('automation:run')[0]).toMatchObject({ ok: false })
  })

  it('registra fallo sin ejecutar acción para tipos no soportados', async () => {
    const repo = new FakeAutomationRepository()
    const bus = new FakeEventBus()
    const service = new AutomationService(repo, bus)
    const automation = await service.create({
      name: 'Mover',
      enabled: true,
      triggerType: 'document:indexed',
      action: { type: 'move', targetDir: '/tmp', createSubdirByExt: false },
    })
    const actions: AutomationActions = {
      async tag() {
        throw new Error('no debería llamarse')
      },
      async classify() {
        throw new Error('no debería llamarse')
      },
    }
    await service.runForTrigger('document:indexed', 1, actions)
    expect(repo.runs[0]).toMatchObject({ automationId: automation.id, ok: false })
    expect(repo.runs[0]?.detail).toContain('no soportada')
  })

  it('setEnabled y remove delegan en el repositorio', async () => {
    const repo = new FakeAutomationRepository()
    const service = new AutomationService(repo, new FakeEventBus())
    const automation = await service.create({
      name: 'A',
      enabled: true,
      triggerType: 'document:indexed',
      action: { type: 'classify' },
    })
    await service.setEnabled(automation.id, false)
    expect((await repo.list())[0]?.enabled).toBe(false)
    await service.remove(automation.id)
    expect(await repo.list()).toHaveLength(0)
  })
})
