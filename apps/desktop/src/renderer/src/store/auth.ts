import { create } from 'zustand'
import type { PublicUser, RegisterUserInput } from '@documind/domain'

export type AuthPhase = 'loading' | 'setup' | 'login' | 'ready'

interface AuthState {
  phase: AuthPhase
  hasUsers: boolean
  currentUser: PublicUser | null
  init(): Promise<void>
  login(username: string, password: string): Promise<void>
  logout(): Promise<void>
  setup(input: RegisterUserInput): Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  phase: 'loading',
  hasUsers: false,
  currentUser: null,

  async init() {
    try {
      const status = await window.api.auth.status()
      set({
        hasUsers: status.hasUsers,
        currentUser: status.currentUser,
        phase: !status.hasUsers ? 'setup' : status.currentUser ? 'ready' : 'login',
      })
    } catch {
      set({ phase: 'login', hasUsers: true, currentUser: null })
    }
  },

  async login(username, password) {
    const user = await window.api.auth.login(username, password)
    set({ currentUser: user, phase: 'ready' })
  },

  async logout() {
    await window.api.auth.logout()
    set({ currentUser: null, phase: 'login' })
  },

  async setup(input) {
    await window.api.auth.setup(input)
    set({ hasUsers: true, phase: 'login' })
  },
}))
