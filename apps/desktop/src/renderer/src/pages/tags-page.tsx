import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Tag, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { queryKeys } from '@/lib/query-keys'
import { useToasts } from '@/lib/toasts'

export function TagsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: () => window.api.tags.list() })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.tags.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats })
      push({ kind: 'success', title: 'Etiqueta eliminada' })
      setPendingDelete(null)
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo eliminar', body: error.message }),
  })

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Etiquetas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organiza tus documentos y filtra tu biblioteca por categorías.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        {tags.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : tags.data && tags.data.length > 0 ? (
          <ul className="divide-y">
            {tags.data.map((tag) => (
              <li key={tag.id} className="group flex items-center gap-3 px-4 py-3">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color ?? '#64748b' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tag.name}</p>
                  <p className="text-xs text-muted-foreground">{tag.count} documento(s)</p>
                </div>
                <Link
                  to={`/documents?tagId=${tag.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Ver documentos
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingDelete(tag.id)}
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`Eliminar etiqueta ${tag.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={<Tag className="size-8" />}
              title="Sin etiquetas"
              description="Crea etiquetas desde la ficha de un documento y úsalas para organizar tu biblioteca."
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Eliminar etiqueta"
        description="La etiqueta se quitará de todos los documentos. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (pendingDelete !== null) deleteMutation.mutate(pendingDelete)
        }}
      />
    </div>
  )
}
