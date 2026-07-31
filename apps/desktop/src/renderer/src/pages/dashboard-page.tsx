import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Copy,
  FileText,
  HardDrive,
  ScanText,
  Timer,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { queryKeys } from '@/lib/query-keys'
import { formatBytes, formatRelative, formatUsd } from '@/lib/format'
import type { ReactNode } from 'react'

function StatCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string
  value: string
  icon: ReactNode
  loading?: boolean
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="truncate text-xl font-semibold">{value}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardPage(): JSX.Element {
  const stats = useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => window.api.documents.stats(),
  })
  const recent = useQuery({
    queryKey: queryKeys.documents,
    queryFn: () => window.api.documents.list({ limit: 6 }),
  })
  const tags = useQuery({
    queryKey: queryKeys.tags,
    queryFn: () => window.api.tags.list(),
  })
  const ocr = useQuery({
    queryKey: queryKeys.ocrHealth,
    queryFn: () => window.api.ocr.health(),
  })
  const ai = useQuery({
    queryKey: queryKeys.aiHealth,
    queryFn: () => window.api.ai.health(),
  })
  const usage = useQuery({
    queryKey: queryKeys.aiUsage,
    queryFn: () => window.api.ai.usage(),
  })

  const s = stats.data
  const loading = stats.isLoading

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Inicio</h1>
        <p className="mt-1 text-sm text-muted-foreground">Resumen de tu biblioteca documental.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Documentos" value={s ? String(s.total) : '—'} icon={<FileText />} loading={loading} />
        <StatCard label="Indexados" value={s ? String(s.indexed) : '—'} icon={<CheckCircle2 />} loading={loading} />
        <StatCard label="Pendientes" value={s ? String(s.pending) : '—'} icon={<Timer />} loading={loading} />
        <StatCard label="Errores" value={s ? String(s.errors) : '—'} icon={<AlertCircle />} loading={loading} />
        <StatCard label="Duplicados" value={s ? String(s.duplicates) : '—'} icon={<Copy />} loading={loading} />
        <StatCard label="Tamaño" value={s ? formatBytes(s.totalSizeBytes) : '—'} icon={<HardDrive />} loading={loading} />
      </div>

      {s?.total === 0 ? (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-semibold">Bienvenido a DocuMind</p>
            <p className="mt-1 text-sm text-muted-foreground">
              En tres pasos tendrás tu biblioteca documental lista.
            </p>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              <li className="flex items-start gap-3 rounded-md border p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  1
                </span>
                <div>
                  <p className="text-sm font-medium">Añade una fuente</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Selecciona la carpeta con tus documentos.</p>
                  <Link to="/sources" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Configurar fuentes
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-md border p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  2
                </span>
                <div>
                  <p className="text-sm font-medium">Indexa y clasifica</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Extrae texto con OCR y clasifica con IA.
                  </p>
                  <Link to="/settings" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Configurar IA
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </li>
              <li className="flex items-start gap-3 rounded-md border p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  3
                </span>
                <div>
                  <p className="text-sm font-medium">Automatiza</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Crea reglas que actúen por ti sobre los documentos.
                  </p>
                  <Link to="/automations" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Crear reglas
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Documentos recientes</CardTitle>
              <CardDescription>Últimos documentos añadidos</CardDescription>
            </div>
            <Link
              to="/documents"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ver todos
              <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {recent.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : recent.data && recent.data.items.length > 0 ? (
              <ul className="divide-y">
                {recent.data.items.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      to={`/documents/${doc.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title ?? doc.filename}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">{formatRelative(doc.addedAt)}</span>
                      <StatusBadge status={doc.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<FileText className="size-8" />}
                title="Sin documentos todavía"
                description="Añade una carpeta de documentos en la sección Fuentes."
                action={
                  <Link to="/sources" className="text-sm font-medium text-primary hover:underline">
                    Configurar fuentes
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Estado del sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <ScanText className="size-4" /> OCR
                </span>
                <StatusBadge status={ocr.data?.ok ? 'ready' : 'error'} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <BrainCircuit className="size-4" /> IA
                </span>
                <StatusBadge status={ai.data?.ok ? 'ready' : 'pending'} />
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">Uso de IA</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-sm font-semibold">{usage.data?.totalCalls ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Llamadas</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{usage.data?.totalTokens ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Tokens</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{formatUsd(usage.data?.totalCostUsd ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">Coste</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Etiquetas</CardTitle>
            </CardHeader>
            <CardContent>
              {tags.data && tags.data.length > 0 ? (
                <ul className="space-y-1.5">
                  {tags.data.map((tag) => (
                    <li key={tag.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: tag.color ?? '#64748b' }} />
                        {tag.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{tag.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No hay etiquetas todavía.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
