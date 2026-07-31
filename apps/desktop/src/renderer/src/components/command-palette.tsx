import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '@/store/theme'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps): JSX.Element | null {
  const navigate = useNavigate()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)

  if (!open) return null

  const run = (action: () => void): void => {
    action()
    onClose()
  }
  const go = (to: string): void => run(() => navigate(to))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border bg-card shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
        >
          <Command.Input placeholder="Buscar páginas y acciones…" autoFocus />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados.
            </Command.Empty>
            <Command.Group heading="Páginas">
              <Command.Item onSelect={() => go('/')}>Inicio</Command.Item>
              <Command.Item onSelect={() => go('/documents')}>Documentos</Command.Item>
              <Command.Item onSelect={() => go('/sources')}>Fuentes</Command.Item>
              <Command.Item onSelect={() => go('/tags')}>Etiquetas</Command.Item>
              <Command.Item onSelect={() => go('/automations')}>Automatizaciones</Command.Item>
              <Command.Item onSelect={() => go('/history')}>Historial</Command.Item>
              <Command.Item onSelect={() => go('/backups')}>Copias de seguridad</Command.Item>
              <Command.Item onSelect={() => go('/settings')}>Ajustes</Command.Item>
            </Command.Group>
            <Command.Group heading="Acciones">
              <Command.Item
                onSelect={() =>
                  run(() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'))
                }
              >
                Cambiar tema ({theme})
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
