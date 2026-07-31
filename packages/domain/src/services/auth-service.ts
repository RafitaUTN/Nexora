import type {
  AuthSession,
  LoginInput,
  PublicUser,
  RegisterUserInput,
  Role,
  User,
} from '../entities/user'
import { registerUserSchema, toPublicUser } from '../entities/user'
import type { PasswordHasher } from '../ports/password-hasher'
import type { SessionRepository, UserRepository } from '../ports/repositories'
import type { SessionTokenService } from '../ports/session-token'

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'ERR_AUTH' | 'ERR_FORBIDDEN' | 'ERR_SETUP_EXISTS' | 'ERR_INVALID_CREDENTIALS',
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

type SetupAdminInput = Omit<RegisterUserInput, 'role'>

/**
 * Autenticación y gestión de usuarios multi-rol. La validación de permisos
 * se hace aquí (nunca solo en la UI). El token de sesión se almacena en la
 * base solo como hash; el valor crudo vive únicamente en el proceso principal.
 */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: SessionTokenService,
    private readonly sessionTtlMs: number = DEFAULT_SESSION_TTL_MS,
  ) {}

  async status(): Promise<{ hasUsers: boolean; currentUser: PublicUser | null }> {
    return { hasUsers: (await this.users.count()) > 0, currentUser: null }
  }

  async setupAdmin(input: SetupAdminInput): Promise<PublicUser> {
    if ((await this.users.count()) > 0) {
      throw new AuthError('Ya existe un administrador', 'ERR_SETUP_EXISTS')
    }
    const parsed = registerUserSchema.parse({ ...input, role: 'admin' })
    const passwordHash = await this.hasher.hash(parsed.password)
    const user = await this.users.create({
      username: parsed.username,
      displayName: parsed.displayName,
      role: 'admin',
      passwordHash,
    })
    return toPublicUser(user)
  }

  async register(actor: PublicUser, input: RegisterUserInput): Promise<PublicUser> {
    this.assertAdmin(actor)
    const parsed = registerUserSchema.parse(input)
    if (await this.users.findByUsername(parsed.username)) {
      throw new AuthError('El nombre de usuario ya existe', 'ERR_AUTH')
    }
    const passwordHash = await this.hasher.hash(parsed.password)
    const user = await this.users.create({
      username: parsed.username,
      displayName: parsed.displayName,
      role: parsed.role,
      passwordHash,
    })
    return toPublicUser(user)
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const { username, password } = input
    const user = await this.users.findByUsername(username)
    if (!user || !(await this.hasher.verify(password, user.passwordHash))) {
      throw new AuthError('Credenciales inválidas', 'ERR_INVALID_CREDENTIALS')
    }
    const token = this.tokens.createToken()
    const expiresAt = new Date(Date.now() + this.sessionTtlMs).toISOString()
    await this.sessions.create({ userId: user.id, tokenHash: this.tokens.hashToken(token), expiresAt })
    return { token, user: toPublicUser(user), expiresAt }
  }

  async authenticate(token: string): Promise<PublicUser | null> {
    if (!token) return null
    const session = await this.sessions.findByTokenHash(this.tokens.hashToken(token))
    if (!session) return null
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await this.sessions.deleteByTokenHash(this.tokens.hashToken(token))
      return null
    }
    const user = await this.users.findById(session.userId)
    if (!user) return null
    await this.sessions.touch(this.tokens.hashToken(token))
    return toPublicUser(user)
  }

  async logout(token: string): Promise<void> {
    if (!token) return
    await this.sessions.deleteByTokenHash(this.tokens.hashToken(token))
  }

  async listUsers(actor: PublicUser): Promise<PublicUser[]> {
    this.assertAdmin(actor)
    const users = await this.users.list()
    return users.map(toPublicUser)
  }

  async setRole(actor: PublicUser, userId: number, role: Role): Promise<PublicUser> {
    this.assertAdmin(actor)
    if (actor.id === userId && role !== 'admin') {
      throw new AuthError('No puedes quitarte el rol de administrador', 'ERR_FORBIDDEN')
    }
    const target = await this.requireUser(userId)
    await this.users.updateRole(userId, role)
    return toPublicUser({ ...target, role })
  }

  async changePassword(actor: PublicUser, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.requireUser(actor.id)
    if (!(await this.hasher.verify(currentPassword, user.passwordHash))) {
      throw new AuthError('La contraseña actual es incorrecta', 'ERR_INVALID_CREDENTIALS')
    }
    if (newPassword.length < 8) {
      throw new AuthError('La contraseña debe tener al menos 8 caracteres', 'ERR_AUTH')
    }
    const passwordHash = await this.hasher.hash(newPassword)
    await this.users.updatePassword(user.id, passwordHash)
    await this.sessions.deleteByUser(user.id)
  }

  async deleteUser(actor: PublicUser, userId: number): Promise<void> {
    this.assertAdmin(actor)
    if (actor.id === userId) {
      throw new AuthError('No puedes eliminar tu propio usuario', 'ERR_FORBIDDEN')
    }
    await this.requireUser(userId)
    await this.sessions.deleteByUser(userId)
    await this.users.delete(userId)
  }

  private assertAdmin(actor: PublicUser): void {
    if (actor.role !== 'admin') {
      throw new AuthError('Se requiere rol de administrador', 'ERR_FORBIDDEN')
    }
  }

  private async requireUser(userId: number): Promise<User> {
    const user = await this.users.findById(userId)
    if (!user) throw new AuthError('Usuario no encontrado', 'ERR_AUTH')
    return user
  }
}
