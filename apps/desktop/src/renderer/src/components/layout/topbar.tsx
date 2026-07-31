import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Search, Sun, Monitor } from 'lucide-react'
import { useTheme } from '@/store/theme'
import { Input } from '@/components/ui/input'

const themeIcons = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const

export function Topbar(): JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)

  const onSearch = (event: FormEvent): void => {
    event.preventDefault()
    const q = query.trim()
    navigate(q ? `/documents?q=${encodeURIComponent(q)}` : '/documents')
  }

  const cycleTheme = (): void => {
    setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')
  }

  const ThemeIcon = themeIcons[theme]

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-6">
      <form onSubmit={onSearch} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar documentos…"
          className="pl-9"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={cycleTheme}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={`Tema: ${theme}`}
        >
          <ThemeIcon className="size-4" />
        </button>
      </div>
    </header>
  )
}
