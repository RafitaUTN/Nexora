import type { NewShare, Share, ShareRepository, ShareRole, ShareStatus } from '@documind/domain'
import type { SqliteDatabase } from '../database'
import { toShare, type ShareRow } from '../mappers'

export class SqliteShareRepository implements ShareRepository {
  constructor(private readonly db: SqliteDatabase) {}

  private select(uid: string): Share | null {
    const row = this.db
      .prepare(`SELECT id, uid, owner_email, member_email, role, status, created_at, updated_at FROM shares WHERE uid = ?`)
      .get(uid) as ShareRow | undefined
    return row ? toShare(row) : null
  }

  async list(): Promise<Share[]> {
    const rows = this.db
      .prepare(`SELECT id, uid, owner_email, member_email, role, status, created_at, updated_at FROM shares ORDER BY created_at`)
      .all() as ShareRow[]
    return rows.map(toShare)
  }

  async listByOwner(ownerEmail: string): Promise<Share[]> {
    const rows = this.db
      .prepare(
        `SELECT id, uid, owner_email, member_email, role, status, created_at, updated_at
         FROM shares WHERE owner_email = ? COLLATE NOCASE ORDER BY created_at`,
      )
      .all(ownerEmail) as ShareRow[]
    return rows.map(toShare)
  }

  async listByMember(memberEmail: string): Promise<Share[]> {
    const rows = this.db
      .prepare(
        `SELECT id, uid, owner_email, member_email, role, status, created_at, updated_at
         FROM shares WHERE member_email = ? COLLATE NOCASE ORDER BY created_at`,
      )
      .all(memberEmail) as ShareRow[]
    return rows.map(toShare)
  }

  async findByUid(uid: string): Promise<Share | null> {
    return this.select(uid)
  }

  async create(input: NewShare & { ownerEmail: string; uid: string }): Promise<Share> {
    const info = this.db
      .prepare(`INSERT INTO shares (uid, owner_email, member_email, role) VALUES (?, ?, ?, ?)`)
      .run(input.uid, input.ownerEmail, input.memberEmail, input.role)
    const row = this.db
      .prepare(`SELECT id, uid, owner_email, member_email, role, status, created_at, updated_at FROM shares WHERE id = ?`)
      .get(Number(info.lastInsertRowid)) as ShareRow
    return toShare(row)
  }

  async updateStatus(uid: string, status: ShareStatus): Promise<Share | null> {
    const info = this.db
      .prepare(`UPDATE shares SET status = ?, updated_at = datetime('now') WHERE uid = ?`)
      .run(status, uid)
    if (info.changes === 0) return null
    return this.select(uid)
  }

  async updateRole(uid: string, role: ShareRole): Promise<Share | null> {
    const info = this.db
      .prepare(`UPDATE shares SET role = ?, updated_at = datetime('now') WHERE uid = ?`)
      .run(role, uid)
    if (info.changes === 0) return null
    return this.select(uid)
  }

  async remove(uid: string): Promise<void> {
    this.db.prepare(`DELETE FROM shares WHERE uid = ?`).run(uid)
  }
}
