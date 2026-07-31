import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, DatabaseBackup, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { queryKeys } from '@/lib/query-keys'
import { formatBytes, formatDateTime } from '@/lib/format'
import { useToasts } from '@/lib/toasts'

export function BackupsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const [pendingRestore, setPendingRestore] = useState<string | null>(null)

  const backups = useQuery({ queryKey: queryKeys.backups, queryFn: () => window.api.backups.list() })

  const createMutation = useMutation({
    mutationFn: () => window.api.backups.create(),
    onSuccess: (entry) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.backups })
      push({ kind: 'success', title: 'Copia de seguridad creada', body: entry.name })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo crear la copia', body: error.message }),
  })

  const restoreMutation = useMutation({
    mutationFn: (name: string) => window.api.backups.restore(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.backups })
      void queryClient.invalidateQueries()
      push({ kind: 'success', title: 'Copia restaurada', body: 'Reinicia la aplicación si es necesario.' })
      setPendingRestore(null)
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo restaurar', body: error.message }),
  })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Copias de seguridad</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea y restaura copias de seguridad de tu biblioteca.
          </p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? <Spinner /> : <DatabaseBackup />}
          Crear copia
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {backups.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : backups.data && backups.data.length > 0 ? (
          <ul className="divide-y">
            {backups.data.map((backup) => (
              <li key={backup.name} className="flex items-center gap-3 px-4 py-3">
                <ArchiveRestore className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{backup.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(backup.createdAt)} · {formatBytes(backup.sizeBytes)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restoreMutation.isPending}
                  onClick={() => setPendingRestore(backup.name)}
                >
                  <RotateCcw />
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={<DatabaseBackup className="size-8" />}
              title="Sin copias de seguridad"
              description="Crea tu primera copia para proteger tus datos."
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        onClose={() => setPendingRestore(null)}
        title="Restaurar copia"
        description={`Se reemplazará la base de datos actual por la copia «${pendingRestore ?? ''}». Esta acción no se puede deshacer.`}
        confirmLabel="Restaurar"
        destructive
        onConfirm={async () => {
          if (pendingRestore !== null) await restoreMutation.mutateAsync(pendingRestore)
        }}
      />
    </div>
  )
}
