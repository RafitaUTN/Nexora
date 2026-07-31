import { describe, expect, it } from 'vitest'
import { AuthService, AuthError } from './auth-service'
import {
  FakePasswordHasher,
  FakeSessionRepository,
  FakeSessionTokenService,
  FakeUserRepository,
} from '../test/fakes'
import type { PublicUser } from '../entities/user'

function setup() {
  const users = new FakeUserRepository()
  const sessions = new FakeSessionRepository()
  const hasher = new FakePasswordHasher()
  const tokens = new FakeSessionTokenService()
  const service = new AuthService(users, sessions, hasher, tokens)
  return { users, sessions, hasher, tokens, service }
}

const admin: PublicUser = { id: 1, username: 'admin', displayName: 'Admin', role: 'admin' }
const viewer: PublicUser = { id: 2, username: 'visitor', displayName: 'Visitor', role: 'viewer' }

describe('AuthService', () => {
  describe('setupAdmin', () => {
    it('crea el primer usuario con rol admin', async () => {
      const { service, users } = setup()
      const created = await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      expect(created.role).toBe('admin')
      expect(created).not.toHaveProperty('passwordHash')
      expect(users.users[0]?.role).toBe('admin')
    })

    it('rechaza si ya existe un administrador', async () => {
      const { service } = setup()
      await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      await expect(
        service.setupAdmin({ username: 'other', displayName: 'Other', password: 's3cret-pass' }),
      ).rejects.toMatchObject({ code: 'ERR_SETUP_EXISTS' })
    })

    it('valida el esquema de registro', async () => {
      const { service } = setup()
      await expect(
        service.setupAdmin({ username: 'ab', displayName: 'Boss', password: 's3cret-pass' }),
      ).rejects.toThrow()
    })
  })

  describe('register', () => {
    it('registra un usuario con rol viewer por defecto', async () => {
      const { service, users } = setup()
      const created = await service.register(admin, { username: 'editor1', displayName: 'Editor', password: 's3cret-pass' })
      expect(created.role).toBe('viewer')
      expect(users.users).toHaveLength(1)
    })

    it('rechaza usuarios duplicados', async () => {
      const { service } = setup()
      await service.register(admin, { username: 'dupe', displayName: 'D', password: 's3cret-pass' })
      await expect(
        service.register(admin, { username: 'DUPE', displayName: 'D', password: 's3cret-pass' }),
      ).rejects.toMatchObject({ code: 'ERR_AUTH' })
    })

    it('solo permite a administradores', async () => {
      const { service } = setup()
      await expect(
        service.register(viewer, { username: 'u', displayName: 'U', password: 's3cret-pass' }),
      ).rejects.toMatchObject({ code: 'ERR_FORBIDDEN' })
    })
  })

  describe('login/authenticate/logout', () => {
    it('emite una sesión y autentica el token', async () => {
      const { service, sessions } = setup()
      await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      const session = await service.login({ username: 'boss', password: 's3cret-pass' })
      expect(session.token).toBeTruthy()
      expect(session.user.role).toBe('admin')
      expect(sessions.sessions).toHaveLength(1)
      expect(sessions.sessions[0]?.tokenHash).not.toBe(session.token)

      const current = await service.authenticate(session.token)
      expect(current?.username).toBe('boss')
    })

    it('rechaza credenciales inválidas', async () => {
      const { service } = setup()
      await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      await expect(service.login({ username: 'boss', password: 'wrong' })).rejects.toMatchObject({
        code: 'ERR_INVALID_CREDENTIALS',
      })
      await expect(service.login({ username: 'nobody', password: 's3cret-pass' })).rejects.toMatchObject({
        code: 'ERR_INVALID_CREDENTIALS',
      })
    })

    it('autenticate devuelve null para tokens desconocidos', async () => {
      const { service } = setup()
      expect(await service.authenticate('nope')).toBeNull()
    })

    it('invalida la sesión al hacer logout', async () => {
      const { service } = setup()
      await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      const session = await service.login({ username: 'boss', password: 's3cret-pass' })
      await service.logout(session.token)
      expect(await service.authenticate(session.token)).toBeNull()
    })

    it('expira la sesión por TTL', async () => {
      const { service, sessions } = setup()
      await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      const session = await service.login({ username: 'boss', password: 's3cret-pass' })
      const stored = sessions.sessions[0]
      if (stored) stored.expiresAt = new Date(Date.now() - 1000).toISOString()
      expect(await service.authenticate(session.token)).toBeNull()
      expect(sessions.sessions).toHaveLength(0)
    })
  })

  describe('listUsers/setRole/deleteUser', () => {
    it('lista usuarios solo como admin', async () => {
      const { service } = setup()
      await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      await expect(service.listUsers(viewer)).rejects.toMatchObject({ code: 'ERR_FORBIDDEN' })
      const list = await service.listUsers(admin)
      expect(list.map((u) => u.username)).toEqual(['boss'])
    })

    it('cambia el rol de un usuario', async () => {
      const { service, users } = setup()
      const boss = await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      const user = await service.register(admin, { username: 'editor1', displayName: 'E', password: 's3cret-pass' })
      const updated = await service.setRole({ ...boss, role: 'admin' }, user.id, 'editor')
      expect(updated.role).toBe('editor')
      expect(users.users.find((u) => u.id === user.id)?.role).toBe('editor')
    })

    it('impide que el admin se quite su propio rol', async () => {
      const { service } = setup()
      const boss = await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      await expect(service.setRole(boss, boss.id, 'viewer')).rejects.toMatchObject({ code: 'ERR_FORBIDDEN' })
    })

    it('elimina usuarios y sus sesiones', async () => {
      const { service, sessions, users } = setup()
      const boss = await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      const user = await service.register(admin, { username: 'editor1', displayName: 'E', password: 's3cret-pass' })
      const session = await service.login({ username: 'editor1', password: 's3cret-pass' })
      await service.deleteUser(boss, user.id)
      expect(users.users.find((u) => u.id === user.id)).toBeUndefined()
      expect(await service.authenticate(session.token)).toBeNull()
      expect(sessions.sessions).toHaveLength(0)
    })

    it('impide eliminarse a sí mismo', async () => {
      const { service } = setup()
      const boss = await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      await expect(service.deleteUser(boss, boss.id)).rejects.toMatchObject({ code: 'ERR_FORBIDDEN' })
    })
  })

  describe('changePassword', () => {
    it('cambia la contraseña e invalida otras sesiones', async () => {
      const { service, users } = setup()
      const boss = await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      await service.changePassword(boss, 's3cret-pass', 'n3w-pass-ok')
      const stored = users.users[0]
      expect(stored?.passwordHash).toBe('$fake$n3w-pass-ok')
      await expect(service.login({ username: 'boss', password: 's3cret-pass' })).rejects.toMatchObject({
        code: 'ERR_INVALID_CREDENTIALS',
      })
    })

    it('rechaza la contraseña actual incorrecta', async () => {
      const { service } = setup()
      const boss = await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      await expect(service.changePassword(boss, 'wrong', 'n3w-pass-ok')).rejects.toMatchObject({
        code: 'ERR_INVALID_CREDENTIALS',
      })
    })

    it('rechaza contraseñas cortas', async () => {
      const { service } = setup()
      const boss = await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
      await expect(service.changePassword(boss, 's3cret-pass', 'short')).rejects.toMatchObject({ code: 'ERR_AUTH' })
    })
  })

  it('status refleja si existen usuarios', async () => {
    const { service } = setup()
    expect(await service.status()).toEqual({ hasUsers: false, currentUser: null })
    await service.setupAdmin({ username: 'boss', displayName: 'Boss', password: 's3cret-pass' })
    expect((await service.status()).hasUsers).toBe(true)
  })
})

describe('AuthError', () => {
  it('expone nombre y código', () => {
    const err = new AuthError('boom', 'ERR_FORBIDDEN')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AuthError')
    expect(err.code).toBe('ERR_FORBIDDEN')
  })
})
