import { useInfiniteQuery } from '@tanstack/react-query'
import { History, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { queryKeys } from '@/lib/query-keys'
import { formatDateTime } from '@/lib/format'

export function HistoryPage(): JSX.Element {
  const audit = useInfiniteQuery({
    queryKey: queryKeys.audit,
    queryFn: ({ pageParam }) => window.api.audit.list(50, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage, _pages) => {
      if (lastPage.length < 50) return undefined
      const lastId = lastPage[lastPage.length - 1]?.id
      return lastId ?? undefined
    },
  })

  const entries = audit.data?.pages.flatMap((page) => page) ?? []

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Historial</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registro de acciones sensibles realizadas en el sistema.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        {audit.isInitialLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : entries.length > 0 ? (
          <>
            <ul className="divide-y">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <ScrollText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{entry.action}</Badge>
                      {entry.entityType ? (
                        <span className="text-xs text-muted-foreground">
                          {entry.entityType}
                          {entry.entityId ? ` #${entry.entityId}` : ''}
                        </span>
                      ) : null}
                    </div>
                    {entry.detail ? <p className="mt-1 text-sm text-foreground">{entry.detail}</p> : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.actor} · {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {audit.hasNextPage ? (
              <div className="flex justify-center border-t p-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void audit.fetchNextPage()}
                  disabled={audit.isFetchingNextPage}
                >
                  {audit.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={<History className="size-8" />}
              title="Sin actividad"
              description="Las acciones sensibles aparecerán aquí."
            />
          </div>
        )}
      </div>
    </div>
  )
}
