import { describe, expect, it } from 'vitest'
import { AuditService } from './audit-service'
import { FakeAuditRepository } from '../test/fakes'

describe('AuditService', () => {
  it('registra acciones sensibles', async () => {
    const repo = new FakeAuditRepository()
    const service = new AuditService(repo)
    await service.record({ action: 'document.deleted', entityType: 'document', entityId: '42' })
    expect(repo.entries).toHaveLength(1)
    expect(repo.entries[0]?.action).toBe('document.deleted')
    expect(repo.entries[0]?.actor).toBe('system')
  })

  it('lista paginando por cursor en orden inverso', async () => {
    const repo = new FakeAuditRepository()
    const service = new AuditService(repo)
    for (let i = 0; i < 5; i++) await service.record({ action: `a${i}` })
    const page = await service.list(2)
    expect(page.map((e) => e.action)).toEqual(['a4', 'a3'])
    const cursor = page[1]?.id
    const next = await service.list(2, cursor)
    expect(next.map((e) => e.action)).toEqual(['a2', 'a1'])
  })
})
