import { randomUUID } from 'node:crypto'
import type { NewShare, Share, ShareRole } from '../entities/share'
import { ShareError } from '../entities/share'
import type { ShareRepository } from '../ports/share'

/**
 * Servicio de compartición multiusuario.
 *
 * El propietario de la biblioteca invita a un usuario remoto por correo; el
 * miembro acepta la invitación y pasa a `active` (la biblioteca se sincroniza
 * hacia su dispositivo según el rol). `revoke` desactiva el acceso sin borrar
 * el historial de la compartición.
 */
export class ShareService {
  constructor(private readonly shares: ShareRepository) {}

  private validateEmail(memberEmail: string): void {
    if (!memberEmail.includes('@')) {
      throw new ShareError('El correo del invitado no es válido', 'ERR_SHARE_INVALID_EMAIL')
    }
  }

  private assertOwner(share: Share, ownerEmail: string): void {
    if (share.ownerEmail.toLowerCase() !== ownerEmail.toLowerCase()) {
      throw new ShareError('Solo el propietario puede realizar esta acción', 'ERR_SHARE_FORBIDDEN')
    }
  }

  /** Crea una invitación (estado `invited`) para un usuario remoto. */
  async invite(ownerEmail: string, memberEmail: string, role: ShareRole = 'viewer'): Promise<Share> {
    const member = memberEmail.trim().toLowerCase()
    this.validateEmail(member)
    if (ownerEmail.toLowerCase() === member) {
      throw new ShareError('No puedes compartir tu biblioteca contigo mismo', 'ERR_SHARE_SELF')
    }
    const existing = (await this.shares.listByOwner(ownerEmail)).find(
      (s) => s.memberEmail === member && s.status !== 'revoked',
    )
    if (existing) {
      throw new ShareError('La biblioteca ya está compartida con ese usuario', 'ERR_SHARE_DUPLICATE')
    }
    return this.shares.create({ ownerEmail, memberEmail: member, role, uid: randomUUID() })
  }

  /** Comparticiones salientes (invitaciones creadas por el propietario). */
  async outgoing(ownerEmail: string): Promise<Share[]> {
    return this.shares.listByOwner(ownerEmail)
  }

  /** Invitaciones entrantes (bibliotecas a las que el usuario fue invitado). */
  async incoming(memberEmail: string): Promise<Share[]> {
    return this.shares.listByMember(memberEmail)
  }

  /** Todas las comparticiones locales (salientes y entrantes). */
  async list(): Promise<Share[]> {
    return this.shares.list()
  }

  /** Acepta una invitación entrante y activa el acceso a la biblioteca. */
  async accept(memberEmail: string, uid: string): Promise<Share> {
    const share = await this.shares.findByUid(uid)
    if (!share) throw new ShareError('Invitación no encontrada', 'ERR_SHARE_NOT_FOUND')
    if (share.memberEmail.toLowerCase() !== memberEmail.toLowerCase()) {
      throw new ShareError('No autorizado para aceptar esta invitación', 'ERR_SHARE_FORBIDDEN')
    }
    if (share.status === 'revoked') {
      throw new ShareError('La invitación fue revocada por el propietario', 'ERR_SHARE_FORBIDDEN')
    }
    const updated = await this.shares.updateStatus(uid, 'active')
    if (!updated) throw new ShareError('Invitación no encontrada', 'ERR_SHARE_NOT_FOUND')
    return updated
  }

  /** Revoca el acceso a la biblioteca (solo propietario). */
  async revoke(ownerEmail: string, uid: string): Promise<Share> {
    const share = await this.shares.findByUid(uid)
    if (!share) throw new ShareError('Compartición no encontrada', 'ERR_SHARE_NOT_FOUND')
    this.assertOwner(share, ownerEmail)
    const updated = await this.shares.updateStatus(uid, 'revoked')
    if (!updated) throw new ShareError('Compartición no encontrada', 'ERR_SHARE_NOT_FOUND')
    return updated
  }

  /** Cambia el rol de un miembro (solo propietario). */
  async setRole(ownerEmail: string, uid: string, role: ShareRole): Promise<Share> {
    const share = await this.shares.findByUid(uid)
    if (!share) throw new ShareError('Compartición no encontrada', 'ERR_SHARE_NOT_FOUND')
    this.assertOwner(share, ownerEmail)
    const updated = await this.shares.updateRole(uid, role)
    if (!updated) throw new ShareError('Compartición no encontrada', 'ERR_SHARE_NOT_FOUND')
    return updated
  }
}

export type { NewShare }
