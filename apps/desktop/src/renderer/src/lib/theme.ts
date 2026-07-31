import type { AppSettings } from '@documind/domain'

export function applyTheme(theme: AppSettings['theme']): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}
