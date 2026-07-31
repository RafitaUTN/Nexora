import { z } from 'zod'

export const roleSchema = z.enum(['admin', 'editor', 'viewer'])
export type Role = z.infer<typeof roleSchema>

export interface User {
  id: number
  username: string
  displayName: string
  passwordHash: string
  role: Role
  createdAt: string
  updatedAt: string
}

export interface PublicUser {
  id: number
  username: string
  displayName: string
  role: Role
}

export interface NewUser {
  username: string
  displayName: string
  role: Role
  password: string
}

export interface AuthSession {
  token: string
  user: PublicUser
  expiresAt: string
}

export const registerUserSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/, 'Solo letras, números, punto, guion y guion bajo'),
  displayName: z.string().trim().min(1).max(64),
  role: roleSchema.default('viewer'),
  password: z.string().min(8).max(200),
})
export type RegisterUserInput = z.input<typeof registerUserSchema>

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
})
export type LoginInput = z.infer<typeof loginSchema>

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
})
