import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BrainCircuit,
  FileText,
  Link2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { TagPill } from '@/components/tag-pill'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { queryKeys } from '@/lib/query-keys'
import { formatBytes, formatDate, formatDateTime } from '@/lib/format'
import { useToasts } from '@/lib/toasts'

function MetaItem({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium" title={value}>
        {value}
      </dd>
    </div>
  )
}

export function DocumentDetailPage(): JSX.Element {
  const { id } = useParams()
  const documentId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const [pendingDelete, setPendingDelete] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [assignTagId, setAssignTagId] = useState('')

  const detail = useQuery({
    queryKey: queryKeys.document(documentId),
    queryFn: () => window.api.documents.get(documentId),
    enabled: Number.isFinite(documentId),
  })

  const tags = useQuery({ queryKey: queryKeys.tags, queryFn: () => window.api.tags.list() })

  const invalidateDetail = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.document(documentId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.tags })
    void queryClient.invalidateQueries({ queryKey: queryKeys.stats })
  }

  const classifyMutation = useMutation({
    mutationFn: () => window.api.ai.classify(documentId),
    onSuccess: (classification) => {
      invalidateDetail()
      push(
        classification
          ? { kind: 'success', title: 'Documento clasificado', body: `Categoría: ${classification.category}` }
          : { kind: 'warning', title: 'Sin clasificación', body: 'Revisa la configuración de IA.' },
      )
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo clasificar', body: error.message }),
  })

  const assignMutation = useMutation({
    mutationFn: (tagId: number) => window.api.tags.assign(tagId, documentId),
    onSuccess: () => {
      invalidateDetail()
      setAssignTagId('')
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo asignar la etiqueta', body: error.message }),
  })

  const removeTagMutation = useMutation({
    mutationFn: (tagId: number) => window.api.tags.remove(tagId, documentId),
    onSuccess: () => invalidateDetail(),
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo quitar la etiqueta', body: error.message }),
  })

  const createTagMutation = useMutation({
    mutationFn: (name: string) => window.api.tags.create({ name }),
    onSuccess: (tag) => {
      assignMutation.mutate(tag.id)
      setNewTagName('')
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo crear la etiqueta', body: error.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => window.api.documents.delete(documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats })
      push({ kind: 'success', title: 'Documento eliminado' })
      navigate('/documents')
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo eliminar', body: error.message }),
  })

  const onCreateTag = (event: FormEvent): void => {
    event.preventDefault()
    const name = newTagName.trim()
    if (!name) return
    createTagMutation.mutate(name)
  }

  if (detail.isLoading || detail.isPending) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!detail.data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/documents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Documentos
        </Link>
        <p className="mt-6 text-sm text-muted-foreground">Documento no encontrado.</p>
      </div>
    )
  }

  const { document: doc, content, tags: docTags, classification } = detail.data
  const assignedIds = new Set(docTags.map((tag) => tag.id))
  const availableTags = (tags.data ?? []).filter((tag) => !assignedIds.has(tag.id))

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link to="/documents" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Documentos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <FileText className="mt-1 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">{doc.title ?? doc.filename}</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{doc.path}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={doc.status} />
              <Badge tone="neutral">{doc.ext.toUpperCase()}</Badge>
              {doc.isDuplicateOf ? (
                <Link
                  to={`/documents/${doc.isDuplicateOf}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                >
                  <Link2 className="size-3.5" />
                  Duplicado de #{doc.isDuplicateOf}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => classifyMutation.mutate()} disabled={classifyMutation.isPending}>
            {classifyMutation.isPending ? <Spinner /> : <BrainCircuit />}
            Clasificar con IA
          </Button>
          <Button variant="destructive" size="icon" aria-label="Eliminar documento" onClick={() => setPendingDelete(true)}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <dl className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetaItem label="Añadido" value={formatDateTime(doc.addedAt)} />
        <MetaItem label="Actualizado" value={formatDateTime(doc.updatedAt)} />
        <MetaItem label="Tamaño" value={formatBytes(doc.sizeBytes)} />
        <MetaItem label="Idioma" value={doc.language ?? '—'} />
        <MetaItem label="Confianza OCR" value={doc.ocrConfidence !== null ? `${(doc.ocrConfidence * 100).toFixed(0)} %` : '—'} />
      </dl>

      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Clasificación</h2>
            {classification ? (
              <Badge tone={classification.cached ? 'neutral' : 'success'}>
                {classification.cached ? 'Caché' : 'Nueva'}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="p-4">
          {classification ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Categoría</p>
                <p className="text-base font-semibold">{classification.category}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Confianza</p>
                <p className="text-base font-semibold">{(classification.confidence * 100).toFixed(0)} %</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Modelo</p>
                <p className="text-base font-medium">{classification.provider} · {classification.model}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fecha</p>
                <p className="text-base font-medium">{formatDate(classification.createdAt)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este documento aún no se ha clasificado. Usa «Clasificar con IA».
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">Etiquetas</h2>
        </div>
        <div className="space-y-4 p-4">
          {docTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {docTags.map((tag) => (
                <TagPill
                  key={tag.id}
                  name={tag.name}
                  color={tag.color}
                  onRemove={() => removeTagMutation.mutate(tag.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin etiquetas.</p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 basis-52 space-y-1.5">
              <Label htmlFor="assign-tag">Asignar etiqueta existente</Label>
              <Select id="assign-tag" value={assignTagId} onChange={(e) => setAssignTagId(e.target.value)}>
                <option value="">Selecciona…</option>
                {availableTags.map((tag) => (
                  <option key={tag.id} value={String(tag.id)}>
                    {tag.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="outline"
              disabled={!assignTagId || assignMutation.isPending}
              onClick={() => assignMutation.mutate(Number(assignTagId))}
            >
              {assignMutation.isPending ? <Spinner /> : null}
              Asignar
            </Button>
          </div>

          <form onSubmit={onCreateTag} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 basis-52 space-y-1.5">
              <Label htmlFor="new-tag">Crear y asignar etiqueta</Label>
              <Input
                id="new-tag"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nombre de la etiqueta"
              />
            </div>
            <Button type="submit" variant="outline" disabled={!newTagName.trim() || createTagMutation.isPending}>
              {createTagMutation.isPending ? <Spinner /> : <Plus />}
              Crear y asignar
            </Button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">Contenido extraído</h2>
        </div>
        <div className="p-4">
          {content ? (
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {content}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">Sin contenido extraído todavía.</p>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={pendingDelete}
        onClose={() => setPendingDelete(false)}
        title="Eliminar documento"
        description="Se eliminará el documento y su contenido indexado. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (deleteMutation.isPending) return
          await deleteMutation.mutateAsync()
        }}
      />
    </div>
  )
}
