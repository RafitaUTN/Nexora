import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { CommandPalette } from '@/components/command-palette'

export function AppShell(): JSX.Element {
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault()
        navigate('/settings')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
