import { useEffect, useState, type ReactNode } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, Search, Trash2 } from 'lucide-react'
import type { DocumentStatus, DocumentSummary } from '@documind/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/status-badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { queryKeys } from '@/lib/query-keys'
import { formatBytes, formatRelative, statusLabels } from '@/lib/format'
import { useToasts } from '@/lib/toasts'

interface Row {
  id: number
  title: string | null
  filename: string
  ext: string
  sizeBytes: number
  status: DocumentStatus
  addedAt: string
  score?: number
}

function DocumentRow({ row, onDelete }: { row: Row; onDelete: (id: number) => void }): JSX.Element {
  return (
    <li>
      <div className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60">
        <Link to={`/documents/${row.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{row.title ?? row.filename}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.filename} · {formatBytes(row.sizeBytes)} · {formatRelative(row.addedAt)}
              {typeof row.score === 'number' ? ` · coincidencia ${row.score.toFixed(2)}` : ''}
            </p>
          </div>
        </Link>
        <Badge tone="neutral" className="hidden sm:inline-flex">
          {row.ext.toUpperCase()}
        </Badge>
        <StatusBadge status={row.status} />
        <button
          type="button"
          onClick={() => onDelete(row.id)}
          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Eliminar ${row.filename}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  )
}

function PageLoading({ rows = 6 }: { rows?: number }): JSX.Element {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  )
}

export function DocumentsPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const [queryInput, setQueryInput] = useState(searchParams.get('q') ?? '')
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const q = searchParams.get('q') ?? ''
  const tagId = searchParams.get('tagId') ? Number(searchParams.get('tagId')) : undefined
  const status = searchParams.get('status') ?? undefined
  const ext = searchParams.get('ext') ?? undefined
  const sort = (searchParams.get('sort') as 'addedAt' | 'updatedAt' | 'filename' | 'sizeBytes') ?? 'addedAt'
  const direction = (searchParams.get('dir') as 'asc' | 'desc') ?? 'desc'

  useEffect(() => {
    setQueryInput(q)
  }, [q])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (queryInput.trim() === q) return
      const next = new URLSearchParams(searchParams)
      if (queryInput.trim()) next.set('q', queryInput.trim())
      else next.delete('q')
      setSearchParams(next, { replace: true })
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput])

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: () => window.api.tags.list() })
  const stats = useQuery({ queryKey: queryKeys.stats, queryFn: () => window.api.documents.stats() })

  const searching = q.trim().length > 0

  const search = useQuery({
    queryKey: [...queryKeys.search, q.trim(), { ext, tagId }],
    queryFn: () => window.api.search.query(q.trim(), 50, { ext, tagId }),
    enabled: searching,
  })

  const list = useInfiniteQuery({
    queryKey: ['documents-list', { tagId, status, ext, sort, direction }],
    queryFn: ({ pageParam }) =>
      window.api.documents.list({
        tagId,
        status: status as DocumentStatus | undefined,
        ext,
        sort,
        direction,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: !searching,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.documents.delete(id),
    onSuccess: (_data, _id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats })
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
      push({ kind: 'success', title: 'Documento eliminado' })
      setPendingDelete(null)
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo eliminar', body: error.message }),
  })

  const rows: Row[] | undefined = searching
    ? search.data?.items.map((item) => ({
        id: item.document.id,
        title: item.document.title,
        filename: item.document.filename,
        ext: item.document.ext,
        sizeBytes: item.document.sizeBytes,
        status: item.document.status,
        addedAt: item.document.addedAt,
        score: item.score,
      }))
    : list.data?.pages.flatMap((page) =>
        page.items.map((doc: DocumentSummary): Row => ({
          id: doc.id,
          title: doc.title,
          filename: doc.filename,
          ext: doc.ext,
          sizeBytes: doc.sizeBytes,
          status: doc.status,
          addedAt: doc.addedAt,
        })),
      )

  const loading = searching ? search.isLoading : list.isInitialLoading

  const renderFilters = (): ReactNode => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Buscar por contenido…"
          className="pl-9"
        />
      </div>
      <Select value={status ?? ''} onChange={(e) => setParam('status', e.target.value || null)}>
        <option value="">Estado: todos</option>
        {Object.entries(statusLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Select value={ext ?? ''} onChange={(e) => setParam('ext', e.target.value || null)}>
        <option value="">Tipo: todos</option>
        {Object.keys(stats.data?.byExt ?? {})
          .sort()
          .map((extKey) => (
            <option key={extKey} value={extKey}>
              {extKey.toUpperCase()}
            </option>
          ))}
      </Select>
      <Select
        value={tagId ? String(tagId) : ''}
        onChange={(e) => setParam('tagId', e.target.value || null)}
      >
        <option value="">Etiqueta: todas</option>
        {tags.data?.map((tag) => (
          <option key={tag.id} value={String(tag.id)}>
            {tag.name}
          </option>
        ))}
      </Select>
      <Select value={sort} onChange={(e) => setParam('sort', e.target.value || null)}>
        <option value="addedAt">Orden: añadidos</option>
        <option value="updatedAt">Orden: actualizados</option>
        <option value="filename">Orden: nombre</option>
        <option value="sizeBytes">Orden: tamaño</option>
      </Select>
      <Select value={direction} onChange={(e) => setParam('dir', e.target.value || null)}>
        <option value="desc">Descendente</option>
        <option value="asc">Ascendente</option>
      </Select>
    </div>
  )

  const isEmpty = !loading && rows && rows.length === 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {searching ? `Resultados para «${q.trim()}»` : 'Todos tus documentos indexados'}
        </p>
      </div>

      {renderFilters()}

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-4">
            <PageLoading />
          </div>
        ) : isEmpty ? (
          <div className="p-4">
            <EmptyState
              icon={<Search className="size-8" />}
              title={searching ? 'Sin resultados' : 'Sin documentos'}
              description={
                searching
                  ? 'Prueba con otros términos de búsqueda.'
                  : 'Añade una fuente de documentos para empezar.'
              }
            />
          </div>
        ) : (
          <ul className="divide-y">
            {rows?.map((row) => (
              <DocumentRow key={row.id} row={row} onDelete={(id) => setPendingDelete(id)} />
            ))}
          </ul>
        )}
      </div>

      {!searching && list.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Eliminar documento"
        description="Se eliminará el documento y su contenido indexado. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (pendingDelete !== null) deleteMutation.mutate(pendingDelete)
        }}
      />
    </div>
  )
}
