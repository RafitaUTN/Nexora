import type { NewUser, Role, User, UserRepository } from '@documind/domain'
import type { SqliteDatabase } from '../database'

interface UserRow {
  id: number
  username: string
  display_name: string
  password_hash: string
  role: Role
  created_at: string
  updated_at: string
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async create(user: Omit<NewUser, 'password'> & { passwordHash: string }): Promise<User> {
    const result = this.db
      .prepare(
        `INSERT INTO users (username, display_name, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run(user.username, user.displayName, user.passwordHash, user.role)
    const row = this.db
      .prepare(
        `SELECT id, username, display_name, password_hash, role, created_at, updated_at
         FROM users WHERE id = ?`,
      )
      .get(result.lastInsertRowid) as UserRow
    return toUser(row)
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = this.db
      .prepare(
        `SELECT id, username, display_name, password_hash, role, created_at, updated_at
         FROM users WHERE username = ? COLLATE NOCASE`,
      )
      .get(username) as UserRow | undefined
    return row ? toUser(row) : null
  }

  async findById(id: number): Promise<User | null> {
    const row = this.db
      .prepare(
        `SELECT id, username, display_name, password_hash, role, created_at, updated_at
         FROM users WHERE id = ?`,
      )
      .get(id) as UserRow | undefined
    return row ? toUser(row) : null
  }

  async list(): Promise<User[]> {
    const rows = this.db
      .prepare(
        `SELECT id, username, display_name, password_hash, role, created_at, updated_at
         FROM users ORDER BY username COLLATE NOCASE`,
      )
      .all() as UserRow[]
    return rows.map(toUser)
  }

  async count(): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }
    return row.n
  }

  async updateRole(id: number, role: Role): Promise<void> {
    this.db
      .prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(role, id)
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    this.db
      .prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(passwordHash, id)
  }

  async delete(id: number): Promise<void> {
    this.db.prepare(`DELETE FROM users WHERE id = ?`).run(id)
  }
}
