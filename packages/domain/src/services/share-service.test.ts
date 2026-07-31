import { describe, expect, it } from 'vitest'
import type { Share } from '../entities/share'
import { ShareError } from '../entities/share'
import type { ShareRole, ShareStatus } from '../entities/share'
import type { ShareRepository } from '../ports/share'
import { ShareService } from './share-service'

class FakeShareRepository implements ShareRepository {
  rows: Share[] = []
  nextId = 1

  async list(): Promise<Share[]> {
    return [...this.rows]
  }
  async listByOwner(ownerEmail: string): Promise<Share[]> {
    return this.rows.filter((s) => s.ownerEmail.toLowerCase() === ownerEmail.toLowerCase())
  }
  async listByMember(memberEmail: string): Promise<Share[]> {
    return this.rows.filter((s) => s.memberEmail.toLowerCase() === memberEmail.toLowerCase())
  }
  async findByUid(uid: string): Promise<Share | null> {
    return this.rows.find((s) => s.uid === uid) ?? null
  }
  async create(input: { ownerEmail: string; memberEmail: string; role: ShareRole; uid: string }): Promise<Share> {
    const share: Share = {
      id: this.nextId++,
      uid: input.uid,
      ownerEmail: input.ownerEmail,
      memberEmail: input.memberEmail,
      role: input.role,
      status: 'invited',
      createdAt: '2026-07-31 10:00:00',
      updatedAt: '2026-07-31 10:00:00',
    }
    this.rows.push(share)
    return share
  }
  async updateStatus(uid: string, status: ShareStatus): Promise<Share | null> {
    const share = this.rows.find((s) => s.uid === uid)
    if (!share) return null
    share.status = status
    return share
  }
  async updateRole(uid: string, role: ShareRole): Promise<Share | null> {
    const share = this.rows.find((s) => s.uid === uid)
    if (!share) return null
    share.role = role
    return share
  }
  async remove(uid: string): Promise<void> {
    this.rows = this.rows.filter((s) => s.uid !== uid)
  }
}

const OWNER = 'owner@example.com'
const MEMBER = 'member@example.com'

describe('ShareService', () => {
  it('invita a un usuario y crea la invitación con estado invited', async () => {
    const service = new ShareService(new FakeShareRepository())
    const share = await service.invite(OWNER, ' Member@Example.com ', 'viewer')
    expect(share.ownerEmail).toBe(OWNER)
    expect(share.memberEmail).toBe('member@example.com')
    expect(share.status).toBe('invited')
    expect(share.role).toBe('viewer')
    expect(share.uid.length).toBeGreaterThan(10)
  })

  it('rechaza correos inválidos', async () => {
    const service = new ShareService(new FakeShareRepository())
    await expect(service.invite(OWNER, 'no-es-un-correo', 'viewer')).rejects.toMatchObject({
      code: 'ERR_SHARE_INVALID_EMAIL',
    })
  })

  it('rechaza compartir la biblioteca consigo mismo', async () => {
    const service = new ShareService(new FakeShareRepository())
    await expect(service.invite(OWNER, OWNER, 'viewer')).rejects.toMatchObject({ code: 'ERR_SHARE_SELF' })
  })

  it('rechaza invitaciones duplicadas activas', async () => {
    const repo = new FakeShareRepository()
    const service = new ShareService(repo)
    await service.invite(OWNER, MEMBER, 'viewer')
    await expect(service.invite(OWNER, MEMBER, 'editor')).rejects.toMatchObject({
      code: 'ERR_SHARE_DUPLICATE',
    })
  })

  it('permite reintentar tras revocar una invitación previa', async () => {
    const repo = new FakeShareRepository()
    const service = new ShareService(repo)
    const first = await service.invite(OWNER, MEMBER, 'viewer')
    await service.revoke(OWNER, first.uid)
    const second = await service.invite(OWNER, MEMBER, 'editor')
    expect(second.status).toBe('invited')
    expect(second.role).toBe('editor')
  })

  it('el miembro acepta la invitación y pasa a active', async () => {
    const repo = new FakeShareRepository()
    const service = new ShareService(repo)
    const share = await service.invite(OWNER, MEMBER, 'viewer')
    const accepted = await service.accept(MEMBER, share.uid)
    expect(accepted.status).toBe('active')
  })

  it('no permite aceptar una invitación de otro usuario', async () => {
    const repo = new FakeShareRepository()
    const service = new ShareService(repo)
    const share = await service.invite(OWNER, MEMBER, 'viewer')
    await expect(service.accept('otro@example.com', share.uid)).rejects.toMatchObject({
      code: 'ERR_SHARE_FORBIDDEN',
    })
  })

  it('no permite aceptar una invitación revocada', async () => {
    const repo = new FakeShareRepository()
    const service = new ShareService(repo)
    const share = await service.invite(OWNER, MEMBER, 'viewer')
    await service.revoke(OWNER, share.uid)
    await expect(service.accept(MEMBER, share.uid)).rejects.toMatchObject({ code: 'ERR_SHARE_FORBIDDEN' })
  })

  it('solo el propietario puede revocar', async () => {
    const repo = new FakeShareRepository()
    const service = new ShareService(repo)
    const share = await service.invite(OWNER, MEMBER, 'viewer')
    await expect(service.revoke(MEMBER, share.uid)).rejects.toMatchObject({ code: 'ERR_SHARE_FORBIDDEN' })
  })

  it('solo el propietario puede cambiar el rol', async () => {
    const repo = new FakeShareRepository()
    const service = new ShareService(repo)
    const share = await service.invite(OWNER, MEMBER, 'viewer')
    await expect(service.setRole(MEMBER, share.uid, 'editor')).rejects.toMatchObject({
      code: 'ERR_SHARE_FORBIDDEN',
    })
    const updated = await service.setRole(OWNER, share.uid, 'editor')
    expect(updated.role).toBe('editor')
  })

  it('lista invitaciones entrantes y salientes', async () => {
    const repo = new FakeShareRepository()
    const service = new ShareService(repo)
    await service.invite(OWNER, MEMBER, 'viewer')
    await service.invite(OWNER, 'otro@example.com', 'editor')
    const outgoing = await service.outgoing(OWNER)
    const incoming = await service.incoming(MEMBER)
    expect(outgoing).toHaveLength(2)
    expect(incoming).toHaveLength(1)
    expect(incoming[0]?.memberEmail).toBe(MEMBER)
  })

  it('lanza ShareError con código tipado en flujos de error', async () => {
    const service = new ShareService(new FakeShareRepository())
    const error = await service.revoke(OWNER, 'uid-inexistente').catch((e) => e)
    expect(error).toBeInstanceOf(ShareError)
    expect((error as ShareError).code).toBe('ERR_SHARE_NOT_FOUND')
  })
})
