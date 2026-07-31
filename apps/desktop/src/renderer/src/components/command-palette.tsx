import { useDeferredValue, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, FolderOpen } from 'lucide-react'
import { useTheme } from '@/store/theme'
import { queryKeys } from '@/lib/query-keys'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

/** Búsqueda global estilo Raycast: documentos indexados + navegación + acciones. */
export function CommandPalette({ open, onClose }: CommandPaletteProps): JSX.Element | null {
  const navigate = useNavigate()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const [query, setQuery] = useState('')
  const [lastOpen, setLastOpen] = useState(open)
  const debounced = useDeferredValue(query.trim())
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setQuery('')
  }

  const search = useQuery({
    queryKey: [...queryKeys.search, 'palette', debounced],
    queryFn: () => window.api.search.query(debounced, 8),
    enabled: open && debounced.length > 0,
  })

  if (!open) return null

  const run = (action: () => void): void => {
    action()
    onClose()
  }
  const go = (to: string): void => run(() => navigate(to))
  const hasQuery = debounced.length > 0
  const results = search.data?.items ?? []

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
          shouldFilter={!hasQuery}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
        >
          <Command.Input
            placeholder="Buscar documentos, páginas y acciones…"
            autoFocus
            value={query}
            onValueChange={setQuery}
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            {hasQuery && search.isFetching && (
              <Command.Loading className="py-6 text-center text-sm text-muted-foreground">
                Buscando…
              </Command.Loading>
            )}
            {hasQuery && !search.isFetching && results.length === 0 && (
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                Sin resultados para «{debounced}».
              </Command.Empty>
            )}
            {results.length > 0 && (
              <Command.Group heading="Documentos">
                {results.map(({ document, score }) => (
                  <Command.Item
                    key={document.id}
                    value={`doc-${document.id}`}
                    onSelect={() => go(`/documents/${document.id}`)}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{document.title || document.filename}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {document.path}
                      </span>
                    </span>
                    {score > 0 && (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {Math.round(score * 100)}%
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading="Páginas">
              <Command.Item value="page-home" onSelect={() => go('/')}>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Inicio
              </Command.Item>
              <Command.Item value="page-documents" onSelect={() => go('/documents')}>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Documentos
              </Command.Item>
              <Command.Item value="page-sources" onSelect={() => go('/sources')}>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Fuentes
              </Command.Item>
              <Command.Item value="page-tags" onSelect={() => go('/tags')}>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Etiquetas
              </Command.Item>
              <Command.Item value="page-automations" onSelect={() => go('/automations')}>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Automatizaciones
              </Command.Item>
              <Command.Item value="page-history" onSelect={() => go('/history')}>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Historial
              </Command.Item>
              <Command.Item value="page-backups" onSelect={() => go('/backups')}>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Copias de seguridad
              </Command.Item>
              <Command.Item value="page-settings" onSelect={() => go('/settings')}>
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Ajustes
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Acciones">
              <Command.Item
                value="action-theme"
                onSelect={() =>
                  run(() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'))
                }
              >
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                Cambiar tema ({theme})
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
