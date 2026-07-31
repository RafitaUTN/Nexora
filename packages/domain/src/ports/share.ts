import type { NewShare, Share, ShareRole, ShareStatus } from '../entities/share'

/** Acceso a las comparticiones persistidas localmente. */
export interface ShareRepository {
  list(): Promise<Share[]>
  /** Comparticiones donde el usuario es el propietario (salientes). */
  listByOwner(ownerEmail: string): Promise<Share[]>
  /** Comparticiones donde el usuario es el miembro invitado (entrantes). */
  listByMember(memberEmail: string): Promise<Share[]>
  findByUid(uid: string): Promise<Share | null>
  create(input: NewShare & { ownerEmail: string; uid: string }): Promise<Share>
  updateStatus(uid: string, status: ShareStatus): Promise<Share | null>
  updateRole(uid: string, role: ShareRole): Promise<Share | null>
  remove(uid: string): Promise<void>
}
