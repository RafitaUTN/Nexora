import { describe, expect, it } from 'vitest'
import { TagService } from './tag-service'
import { FakeEventBus, FakeTagRepository } from '../test/fakes'

describe('TagService', () => {
  it('no duplica etiquetas con el mismo nombre', async () => {
    const service = new TagService(new FakeTagRepository(), new FakeEventBus())
    const first = await service.create({ name: 'Factura' })
    const second = await service.create({ name: 'Factura' })
    expect(second.id).toBe(first.id)
  })

  it('ensureSuggested recorta, ignora vacíos y reutiliza existentes', async () => {
    const repo = new FakeTagRepository()
    const service = new TagService(repo, new FakeEventBus())
    const created = await service.ensureSuggested(['  Contrato ', '', '  ', 'Factura'])
    expect(created).toHaveLength(2)
    expect(created[0]?.name).toBe('Contrato')
    const reused = await service.ensureSuggested(['Contrato', 'Factura'])
    expect(reused[0]?.id).toBe(created[0]?.id)
    expect(repo.tags).toHaveLength(2)
  })

  it('asignar emite una notificación informativa', async () => {
    const bus = new FakeEventBus()
    const service = new TagService(new FakeTagRepository(), bus)
    await service.assign(1, 10)
    expect(bus.eventsOf('notification')).toHaveLength(1)
  })

  it('listWithStats cuenta las asignaciones', async () => {
    const repo = new FakeTagRepository()
    const service = new TagService(repo, new FakeEventBus())
    const tag = await service.create({ name: 'legal' })
    await service.assign(tag.id, 1)
    await service.assign(tag.id, 2)
    const stats = await service.listWithStats()
    expect(stats[0]?.count).toBe(2)
  })
})
