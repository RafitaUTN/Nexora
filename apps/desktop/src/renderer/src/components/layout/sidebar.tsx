import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import {
  Bot,
  FileText,
  FolderInput,
  HardDriveDownload,
  History,
  LayoutDashboard,
  Settings,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'

const navigation = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/documents', label: 'Documentos', icon: FileText, end: false },
  { to: '/sources', label: 'Fuentes', icon: FolderInput, end: false },
  { to: '/automations', label: 'Automatizaciones', icon: Bot, end: false },
  { to: '/history', label: 'Historial', icon: History, end: false },
  { to: '/backups', label: 'Copias de seguridad', icon: HardDriveDownload, end: false },
  { to: '/settings', label: 'Ajustes', icon: Settings, end: false },
]

export function Sidebar(): JSX.Element {
  const system = useQuery({
    queryKey: queryKeys.system,
    queryFn: () => window.api.system.info(),
  })

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2.5 border-b px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">DocuMind</p>
          <p className="text-xs text-muted-foreground">Gestión documental</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t px-5 py-3 text-xs text-muted-foreground">
        <p>
          {system.data?.name ?? 'DocuMind'} v{system.data?.version ?? '—'}
        </p>
      </div>
    </aside>
  )
}
