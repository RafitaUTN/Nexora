import { create } from 'zustand'
import type { AppSettings } from '@documind/domain'
import { applyTheme } from '@/lib/theme'

interface ThemeState {
  theme: AppSettings['theme']
  setTheme: (theme: AppSettings['theme']) => void
}

export const useTheme = create<ThemeState>((set) => ({
  theme: 'system',
  setTheme: (theme) => {
    set({ theme })
    applyTheme(theme)
  },
}))
