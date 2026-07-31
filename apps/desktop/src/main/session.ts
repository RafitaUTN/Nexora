import type { AuthService, PublicUser, RegisterUserInput, Role, SecretStore } from '@documind/domain'
import { AuthError } from '@documind/domain'

const SESSION_KIND = 'session'

/**
 * Gestiona la sesión activa del proceso principal. El token opaco nunca sale
 * de aquí: al renderer solo llegan usuarios públicos. Si `SecretStore` está
 * disponible, el token se persiste cifrado para restaurar la sesión al reiniciar.
 */
export class SessionManager {
  private token: string | null = null
  private user: PublicUser | null = null

  constructor(
    private readonly auth: AuthService,
    private readonly secrets: SecretStore,
  ) {}

  /** Restaura una sesión persistida (si existe y no ha expirado). */
  async restore(): Promise<PublicUser | null> {
    const persisted = await this.secrets.get(SESSION_KIND)
    if (!persisted) return null
    const user = await this.auth.authenticate(persisted)
    if (!user) {
      await this.secrets.delete(SESSION_KIND)
      return null
    }
    this.token = persisted
    this.user = user
    return user
  }

  current(): PublicUser | null {
    return this.user
  }

  async status(): Promise<{ hasUsers: boolean; currentUser: PublicUser | null }> {
    const { hasUsers } = await this.auth.status()
    return { hasUsers, currentUser: this.user }
  }

  async login(username: string, password: string): Promise<PublicUser> {
    const session = await this.auth.login({ username, password })
    this.token = session.token
    this.user = session.user
    await this.secrets.set(SESSION_KIND, session.token)
    return session.user
  }

  async logout(): Promise<void> {
    if (this.token) await this.auth.logout(this.token)
    this.token = null
    this.user = null
    await this.secrets.delete(SESSION_KIND)
  }

  async setupAdmin(input: RegisterUserInput): Promise<PublicUser> {
    return this.auth.setupAdmin(input)
  }

  async register(input: RegisterUserInput): Promise<PublicUser> {
    return this.auth.register(this.requireUser(), input)
  }

  async listUsers(): Promise<PublicUser[]> {
    return this.auth.listUsers(this.requireUser())
  }

  async setRole(userId: number, role: Role): Promise<PublicUser> {
    return this.auth.setRole(this.requireUser(), userId, role)
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.auth.changePassword(this.requireUser(), currentPassword, newPassword)
  }

  async deleteUser(userId: number): Promise<void> {
    const actor = this.requireUser()
    await this.auth.deleteUser(actor, userId)
    if (actor.id === userId) {
      this.token = null
      this.user = null
    }
  }

  private requireUser(): PublicUser {
    if (!this.user) throw new AuthError('Sesión no iniciada', 'ERR_AUTH')
    return this.user
  }
}
