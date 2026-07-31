import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, FileText, Folder, FolderPlus, RefreshCw, Trash2 } from 'lucide-react'
import type { ScanMode, SourceKind } from '@documind/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { queryKeys } from '@/lib/query-keys'
import { formatRelative } from '@/lib/format'
import { useToasts } from '@/lib/toasts'

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function SourcesPage(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const sources = useQuery({ queryKey: queryKeys.sources, queryFn: () => window.api.sources.list() })

  const [addOpen, setAddOpen] = useState(false)
  const [kind, setKind] = useState<SourceKind>('folder')
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [scanMode, setScanMode] = useState<ScanMode>('recursive')
  const [enabled, setEnabled] = useState(true)
  const [pendingRemove, setPendingRemove] = useState<number | null>(null)
  const [rescanningId, setRescanningId] = useState<number | null>(null)

  const pickPath = async (): Promise<void> => {
    const selected = kind === 'folder' ? await window.api.system.selectFolder() : await window.api.system.selectFile()
    if (!selected) return
    setPath(selected)
    if (!name || name === basename(path)) setName(basename(selected))
  }

  const addMutation = useMutation({
    mutationFn: () =>
      window.api.sources.add({ path, name: name.trim() || basename(path), kind, scanMode, enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sources })
      push({ kind: 'success', title: 'Fuente añadida' })
      setAddOpen(false)
      setPath('')
      setName('')
      setKind('folder')
      setScanMode('recursive')
      setEnabled(true)
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo añadir la fuente', body: error.message }),
  })

  const removeMutation = useMutation({
    mutationFn: (id: number) => window.api.sources.remove(id),
    onSuccess: (_data, _id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sources })
      push({ kind: 'success', title: 'Fuente eliminada' })
      setPendingRemove(null)
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo eliminar la fuente', body: error.message }),
  })

  const rescanMutation = useMutation({
    mutationFn: async (id: number) => {
      setRescanningId(id)
      try {
        return await window.api.sources.rescan(id)
      } finally {
        setRescanningId(null)
      }
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sources })
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats })
      push({
        kind: result.errors.length > 0 ? 'warning' : 'success',
        title: 'Rescan completado',
        body:
          result.errors.length > 0
            ? `${result.indexed} indexados, ${result.errors.length} con errores`
            : `${result.indexed} documentos indexados de ${result.scanned}`,
      })
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo escanear', body: error.message }),
  })

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (!path.trim()) return
    addMutation.mutate()
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Fuentes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Carpetas y archivos de los que se importan documentos.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <FolderPlus />
          Añadir fuente
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {sources.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : sources.data && sources.data.length > 0 ? (
          <ul className="divide-y">
            {sources.data.map((source) => (
              <li key={source.id} className="flex items-center gap-3 px-4 py-3">
                {source.kind === 'folder' ? (
                  <Folder className="size-5 shrink-0 text-amber-500" />
                ) : (
                  <FileText className="size-5 shrink-0 text-sky-500" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{source.name}</p>
                    <Badge tone="neutral">{source.kind === 'folder' ? 'Carpeta' : 'Archivo'}</Badge>
                    {!source.enabled ? <Badge tone="warning">Desactivada</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {source.path} · escaneada {formatRelative(source.lastScanAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rescanningId === source.id}
                  onClick={() => rescanMutation.mutate(source.id)}
                >
                  {rescanningId === source.id ? <Spinner /> : <RefreshCw />}
                  Escanear
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${source.name}`}
                  onClick={() => setPendingRemove(source.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={<FolderPlus className="size-8" />}
              title="Sin fuentes"
              description="Añade una carpeta o un archivo para empezar a indexar documentos."
            />
          </div>
        )}
      </div>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Añadir fuente"
        description="Selecciona dónde buscar documentos para indexar."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={kind === 'folder' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setKind('folder')}
            >
              <Folder />
              Carpeta
            </Button>
            <Button
              type="button"
              variant={kind === 'file' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setKind('file')}
            >
              <FilePlus2 />
              Archivo
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Ruta</Label>
            <div className="flex gap-2">
              <Input value={path} readOnly placeholder={kind === 'folder' ? 'Carpeta…' : 'Archivo…'} className="flex-1" />
              <Button type="button" variant="outline" onClick={() => void pickPath()}>
                Elegir…
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source-name">Nombre</Label>
            <Input
              id="source-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={basename(path) || 'Mi fuente'}
            />
          </div>

          {kind === 'folder' ? (
            <div className="space-y-1.5">
              <Label htmlFor="source-mode">Exploración</Label>
              <Select id="source-mode" value={scanMode} onChange={(e) => setScanMode(e.target.value as ScanMode)}>
                <option value="recursive">Recursiva (subcarpetas)</option>
                <option value="flat">Solo nivel superior</option>
              </Select>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Activa</p>
              <p className="text-xs text-muted-foreground">Incluir en futuros escaneos</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!path.trim() || addMutation.isPending}>
              {addMutation.isPending ? <Spinner /> : null}
              Añadir
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title="Eliminar fuente"
        description="Se eliminará la fuente, pero los documentos ya indexados se conservarán."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (pendingRemove !== null) removeMutation.mutate(pendingRemove)
        }}
      />
    </div>
  )
}
