import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  KeyRound,
  LogOut,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wifi,
} from 'lucide-react'
import { IpcEvent } from '@documind/shared'
import type {
  AppSettings,
  License,
  LicenseKey,
  LicenseTier,
  OcrLanguageInfo,
  OcrLanguageProgress,
  ProviderId,
  UpdateStatus,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { queryKeys } from '@/lib/query-keys'
import { useToasts } from '@/lib/toasts'
import { useAuth } from '@/store/auth'

const PROVIDERS: ProviderId[] = ['openrouter', 'openai', 'gemini', 'claude', 'ollama']

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  ollama: 'Ollama (local)',
}

interface SettingsForm {
  theme: 'system' | 'light' | 'dark'
  language: 'es' | 'en'
  ocrLanguages: string
  ocrMaxDpi: string
  telemetry: boolean
  provider: string
  sendWholeDocument: boolean
  autoCheck: boolean
  autoDownload: boolean
}

function toForm(settings: AppSettings): SettingsForm {
  return {
    theme: settings.theme,
    language: settings.language,
    ocrLanguages: settings.ocrLanguages.join(', '),
    ocrMaxDpi: String(settings.ocrMaxDpi),
    telemetry: settings.telemetry,
    provider: settings.ai.provider ?? '',
    sendWholeDocument: settings.ai.sendWholeDocument,
    autoCheck: settings.updates.autoCheck,
    autoDownload: settings.updates.autoDownload,
  }
}

function ProviderApiKeyRow({ provider }: { provider: ProviderId }): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const [value, setValue] = useState('')

  const status = useQuery({
    queryKey: queryKeys.apiKey(provider),
    queryFn: () => window.api.ai.apiKeyStatus(provider),
  })

  const setKeyMutation = useMutation({
    mutationFn: (key: string) => window.api.ai.setApiKey(provider, key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKey(provider) })
      push({ kind: 'success', title: `Clave guardada para ${PROVIDER_LABELS[provider]}` })
      setValue('')
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo guardar la clave', body: error.message }),
  })

  const deleteKeyMutation = useMutation({
    mutationFn: () => window.api.ai.deleteApiKey(provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKey(provider) })
      push({ kind: 'success', title: `Clave eliminada para ${PROVIDER_LABELS[provider]}` })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo eliminar la clave', body: error.message }),
  })

  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">{PROVIDER_LABELS[provider]}</p>
          {status.data ? (
            <Badge tone={status.data.set ? 'success' : 'neutral'}>
              {status.data.set ? 'Configurada' : 'Sin clave'}
            </Badge>
          ) : null}
        </div>
      </div>
      <Input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="sk-…"
        className="flex-1 basis-56"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={!value.trim() || setKeyMutation.isPending}
        onClick={() => setKeyMutation.mutate(value.trim())}
      >
        {setKeyMutation.isPending ? <Spinner /> : null}
        Guardar
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Eliminar clave de ${PROVIDER_LABELS[provider]}`}
        disabled={deleteKeyMutation.isPending || !status.data?.set}
        onClick={() => deleteKeyMutation.mutate()}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function AiModelRow({ provider }: { provider: ProviderId | null }): JSX.Element | null {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const modelQuery = useQuery({
    queryKey: queryKeys.aiModel(provider ?? ''),
    queryFn: () => window.api.ai.resolveModel(provider ?? '', false),
    enabled: !!provider,
    staleTime: 60_000,
  })
  const recommend = useMutation({
    mutationFn: () => window.api.ai.resolveModel(provider ?? '', true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiModel(provider ?? '') })
      push({ kind: 'success', title: 'Modelo recomendado guardado' })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo elegir el modelo', body: error.message }),
  })
  if (!provider) return null
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <p className="text-sm font-medium">Modelo</p>
      <div className="flex items-center gap-2">
        <div className="flex h-9 flex-1 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
          {modelQuery.isLoading ? 'Seleccionando…' : (modelQuery.data?.model ?? 'Por configurar')}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={recommend.isPending || modelQuery.isLoading}
          onClick={() => recommend.mutate()}
        >
          {recommend.isPending ? <Spinner /> : <Sparkles />}
          Recomendar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        El mejor modelo disponible para el proveedor se elige automáticamente.
      </p>
    </div>
  )
}

const STATUS_META: Record<
  UpdateStatus['status'],
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' }
> = {
  idle: { label: 'Sin comprobar', tone: 'neutral' },
  checking: { label: 'Comprobando…', tone: 'info' },
  available: { label: 'Actualización disponible', tone: 'warning' },
  current: { label: 'Actualizado', tone: 'success' },
  downloading: { label: 'Descargando…', tone: 'info' },
  downloaded: { label: 'Lista para instalar', tone: 'success' },
  error: { label: 'Error', tone: 'error' },
}

const TIER_LABELS: Record<LicenseTier, string> = {
  free: 'Gratuita',
  pro: 'Pro',
  enterprise: 'Empresa',
}

const LICENSE_STATUS_META: Record<
  License['status'],
  { label: string; tone: 'neutral' | 'success' | 'error' }
> = {
  active: { label: 'Activa', tone: 'success' },
  expired: { label: 'Expirada', tone: 'error' },
  revoked: { label: 'Revocada', tone: 'error' },
}

function LicenseSection(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const currentUser = useAuth((s) => s.currentUser)
  const isAdmin = currentUser?.role === 'admin'
  const [key, setKey] = useState('')

  const license = useQuery({ queryKey: queryKeys.license, queryFn: () => window.api.license.status() })

  const activateMutation = useMutation({
    mutationFn: (licenseKey: string) => window.api.license.activate(licenseKey as LicenseKey),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.license })
      setKey('')
      push({ kind: 'success', title: 'Licencia activada', body: `Plan ${TIER_LABELS[next.tier]}` })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo activar la licencia', body: error.message }),
  })

  const deactivateMutation = useMutation({
    mutationFn: () => window.api.license.deactivate(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.license })
      push({ kind: 'success', title: 'Licencia desactivada en este dispositivo' })
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo desactivar', body: error.message }),
  })

  const meta = license.data
    ? LICENSE_STATUS_META[license.data.status]
    : { label: '…', tone: 'neutral' as const }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {license.data ? <Badge tone="info">{TIER_LABELS[license.data.tier]}</Badge> : null}
          {license.data && license.data.tier !== 'free' ? (
            <p className="text-sm text-muted-foreground">
              {license.data.expiresAt
                ? `Válida hasta ${new Date(license.data.expiresAt).toLocaleDateString()}`
                : 'Licencia perpetua'}
            </p>
          ) : null}
        </div>
        {isAdmin ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => deactivateMutation.mutate()}
            disabled={deactivateMutation.isPending || license.data?.tier === 'free'}
          >
            {deactivateMutation.isPending ? <Spinner /> : <LogOut />}
            Desactivar
          </Button>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="flex-1 basis-64"
            disabled={license.data?.tier !== 'free' || activateMutation.isPending}
          />
          <Button
            size="sm"
            disabled={!key.trim() || license.data?.tier !== 'free' || activateMutation.isPending}
            onClick={() => activateMutation.mutate(key.trim())}
          >
            {activateMutation.isPending ? <Spinner /> : <KeyRound />}
            Activar licencia
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function UpdatesSection(): JSX.Element {
  const push = useToasts((s) => s.push)
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void window.api.updates.state().then(setStatus)
    return window.api.on<UpdateStatus>(IpcEvent.EventUpdateStatus, setStatus)
  }, [])

  const checkMutation = useMutation({
    mutationFn: () => window.api.updates.check(),
    onSuccess: (next) => setStatus(next),
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo buscar actualizaciones', body: error.message }),
  })

  const downloadMutation = useMutation({
    mutationFn: () => window.api.updates.download(),
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo descargar', body: error.message }),
  })

  const installMutation = useMutation({
    mutationFn: () => window.api.updates.install(),
    onSuccess: () => push({ kind: 'success', title: 'Reiniciando para instalar…' }),
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo instalar', body: error.message }),
  })

  const meta = status ? STATUS_META[status.status] : STATUS_META.idle

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {status && status.currentVersion ? (
            <p className="text-sm text-muted-foreground">
              Versión {status.currentVersion}
              {status.latestVersion ? ` → ${status.latestVersion}` : ''}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => checkMutation.mutate()}
          disabled={checkMutation.isPending || status?.status === 'downloading'}
        >
          {checkMutation.isPending ? <Spinner /> : <RefreshCw />}
          Buscar actualizaciones
        </Button>
      </div>

      {status?.message ? <p className="text-sm text-destructive">{status.message}</p> : null}

      {status?.status === 'available' ? (
        <Button size="sm" onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}>
          {downloadMutation.isPending ? <Spinner /> : <Download />}
          Descargar e instalar
        </Button>
      ) : null}

      {status?.status === 'downloading' ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${status.progress ?? 0}%` }} />
        </div>
      ) : null}

      {status?.status === 'downloaded' ? (
        <Button size="sm" onClick={() => installMutation.mutate()} disabled={installMutation.isPending}>
          {installMutation.isPending ? <Spinner /> : <Download />}
          Reiniciar e instalar
        </Button>
      ) : null}
    </div>
  )
}

function OcrSection({
  form,
  set,
}: {
  form: SettingsForm
  set: (key: 'ocrLanguages', value: string) => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const [query, setQuery] = useState('')
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [updates, setUpdates] = useState<Record<string, string>>({})

  const active = useMemo(
    () =>
      new Set(
        form.ocrLanguages
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    [form.ocrLanguages],
  )

  const languages = useQuery({
    queryKey: queryKeys.ocrLanguages,
    queryFn: () => window.api.ocr.languages(),
  })

  useEffect(
    () =>
      window.api.on<OcrLanguageProgress>(IpcEvent.EventOcrLanguageProgress, (p) => {
        if (p.status === 'downloading') {
          setDownloading((d) => ({ ...d, [p.code]: true }))
          setProgress((pr) => ({ ...pr, [p.code]: p.progress }))
        }
      }),
    [],
  )

  const setActive = (code: string, enabled: boolean): void => {
    const next = new Set(active)
    if (enabled) next.add(code)
    else next.delete(code)
    set('ocrLanguages', [...next].join(','))
  }

  const installMutation = useMutation({
    mutationFn: (code: string) => window.api.ocr.installLanguage(code),
    onMutate: (code) => {
      setDownloading((d) => ({ ...d, [code]: true }))
      setProgress((p) => ({ ...p, [code]: 0 }))
    },
    onSuccess: ({ code }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ocrLanguages })
      setDownloading((d) => {
        const next = { ...d }
        delete next[code]
        return next
      })
      setProgress((p) => {
        const next = { ...p }
        delete next[code]
        return next
      })
      setUpdates((u) => {
        const next = { ...u }
        delete next[code]
        return next
      })
      setActive(code, true)
      push({ kind: 'success', title: 'Idioma instalado', body: 'Ahora se usará para leer tus documentos.' })
    },
    onError: (error: Error, code) => {
      setDownloading((d) => {
        const next = { ...d }
        delete next[code]
        return next
      })
      setProgress((p) => {
        const next = { ...p }
        delete next[code]
        return next
      })
      push({ kind: 'error', title: 'No se pudo instalar el idioma', body: error.message })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (code: string) => window.api.ocr.removeLanguage(code),
    onSuccess: ({ code }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ocrLanguages })
      setUpdates((u) => {
        const next = { ...u }
        delete next[code]
        return next
      })
      push({ kind: 'success', title: 'Idioma eliminado' })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo eliminar el idioma', body: error.message }),
  })

  const checkUpdatesMutation = useMutation({
    mutationFn: () => window.api.ocr.checkLanguageUpdates(),
    onSuccess: (result) => {
      setUpdates(Object.fromEntries(result.map((u) => [u.code, u.latestVersion])))
      push(
        result.length > 0
          ? {
              kind: 'info',
              title: 'Actualizaciones disponibles',
              body: `${result.length} idioma(s) con versión nueva`,
            }
          : { kind: 'success', title: 'Idiomas actualizados' },
      )
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo comprobar', body: error.message }),
  })

  const list: OcrLanguageInfo[] = languages.data ?? []
  const filtered = query.trim()
    ? list.filter((lang) =>
        `${lang.name} ${lang.nativeName}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : list

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar idioma…"
              aria-label="Buscar idioma OCR"
              className="pl-9"
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => checkUpdatesMutation.mutate()}
          disabled={checkUpdatesMutation.isPending}
        >
          {checkUpdatesMutation.isPending ? <Spinner /> : <RefreshCw />}
          Comprobar actualizaciones
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Los idiomas activos se usan automáticamente para leer documentos escaneados. Los más comunes ya vienen
        preinstalados.
      </p>

      {languages.isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {filtered.map((lang) => {
            const isActive = active.has(lang.code)
            const isDownloading = Boolean(downloading[lang.code])
            const hasUpdate = updates[lang.code] !== undefined
            const pct = progress[lang.code] ?? 0
            return (
              <div
                key={lang.code}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{lang.name}</p>
                    {lang.installed ? (
                      <Badge tone={lang.preinstalled ? 'info' : 'success'}>
                        {lang.preinstalled ? 'Preinstalado' : 'Instalado'}
                      </Badge>
                    ) : null}
                    {isActive ? <Badge tone="success">Activo</Badge> : null}
                    {hasUpdate ? <Badge tone="warning">Actualización disponible</Badge> : null}
                  </div>
                  {lang.nativeName && lang.nativeName !== lang.name ? (
                    <p className="text-xs text-muted-foreground">{lang.nativeName}</p>
                  ) : null}
                  {isDownloading ? (
                    <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {isDownloading ? (
                    <span className="text-xs text-muted-foreground">Descargando…</span>
                  ) : lang.installed ? (
                    <>
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => setActive(lang.code, checked)}
                        aria-label={`Usar ${lang.name}`}
                      />
                      {hasUpdate ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => installMutation.mutate(lang.code)}
                          disabled={installMutation.isPending}
                        >
                          {installMutation.isPending ? <Spinner /> : <Download />}
                          Actualizar
                        </Button>
                      ) : null}
                      {!isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar ${lang.name}`}
                          onClick={() => removeMutation.mutate(lang.code)}
                          disabled={removeMutation.isPending}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => installMutation.mutate(lang.code)}
                      disabled={installMutation.isPending}
                    >
                      {installMutation.isPending && installMutation.variables === lang.code ? (
                        <Spinner />
                      ) : (
                        <Download />
                      )}
                      Descargar
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 ? <p className="text-sm text-muted-foreground">Sin resultados.</p> : null}
        </div>
      )}
    </div>
  )
}

export function SettingsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: () => window.api.settings.get() })
  const [form, setForm] = useState<SettingsForm | null>(() => (settings.data ? toForm(settings.data) : null))
  const [prevSettings, setPrevSettings] = useState<AppSettings | null>(settings.data ?? null)
  const [dirty, setDirty] = useState(false)

  // Sincroniza el formulario cuando llegan los ajustes (o cambian tras un
  // guardado) sin pisar una edición en curso. Es "adjust state during render",
  // el patrón oficial de React para derivar estado de un prop.
  if (settings.data && !dirty && prevSettings !== settings.data) {
    setPrevSettings(settings.data)
    setForm(toForm(settings.data))
  }

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]): void => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
  }

  const saveMutation = useMutation({
    mutationFn: async (): Promise<AppSettings> => {
      if (!form) throw new Error('No hay cambios')
      return window.api.settings.set({
        theme: form.theme,
        language: form.language,
        ocrLanguages: form.ocrLanguages
          .split(',')
          .map((lang) => lang.trim())
          .filter(Boolean),
        ocrMaxDpi: Number(form.ocrMaxDpi),
        telemetry: form.telemetry,
        ai: {
          provider: (form.provider || null) as ProviderId | null,
          sendWholeDocument: form.sendWholeDocument,
        },
        updates: {
          autoCheck: form.autoCheck,
          autoDownload: form.autoDownload,
        },
      })
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
      setForm(toForm(saved))
      setDirty(false)
      push({ kind: 'success', title: 'Ajustes guardados' })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudieron guardar los ajustes', body: error.message }),
  })

  const healthMutation = useMutation({
    mutationFn: () => window.api.ai.health(),
    onSuccess: (health) => {
      push(
        health.ok
          ? { kind: 'success', title: 'IA disponible' }
          : { kind: 'warning', title: 'IA no disponible', body: health.error ?? 'Sin conexión' },
      )
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo comprobar la IA', body: error.message }),
  })

  if (settings.isLoading || !form) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Ajustes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configuración general, OCR y del motor de IA.</p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
          {saveMutation.isPending ? <Spinner /> : <Save />}
          Guardar
        </Button>
      </div>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">General</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-theme">Tema</Label>
            <Select
              id="settings-theme"
              value={form.theme}
              onChange={(e) => set('theme', e.target.value as SettingsForm['theme'])}
            >
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-language">Idioma</Label>
            <Select
              id="settings-language"
              value={form.language}
              onChange={(e) => set('language', e.target.value as SettingsForm['language'])}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Telemetría</p>
              <p className="text-xs text-muted-foreground">Enviar datos anónimos de uso</p>
            </div>
            <Switch checked={form.telemetry} onCheckedChange={(checked) => set('telemetry', checked)} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">OCR</h2>
          <p className="text-xs text-muted-foreground">
            Lectura del texto en documentos escaneados y fotografiados.
          </p>
        </div>
        <OcrSection form={form} set={set} />
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-semibold">Inteligencia artificial</h2>
            <p className="text-xs text-muted-foreground">Clasificación y extracción de entidades</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => healthMutation.mutate()}
            disabled={healthMutation.isPending}
          >
            {healthMutation.isPending ? <Spinner /> : <Wifi />}
            Comprobar conexión
          </Button>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-provider">Proveedor</Label>
            <Select
              id="settings-provider"
              value={form.provider}
              onChange={(e) => set('provider', e.target.value)}
            >
              <option value="">Ninguno</option>
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {PROVIDER_LABELS[provider]}
                </option>
              ))}
            </Select>
          </div>
          <AiModelRow provider={settings.data?.ai.provider ?? null} />
          {form.provider && form.provider !== 'ollama' ? (
            <div className="sm:col-span-2">
              <ProviderApiKeyRow provider={form.provider as ProviderId} />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Enviar documento completo</p>
              <p className="text-xs text-muted-foreground">Si no, se envía un extracto</p>
            </div>
            <Switch
              checked={form.sendWholeDocument}
              onCheckedChange={(checked) => set('sendWholeDocument', checked)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">Actualizaciones</h2>
          <p className="text-xs text-muted-foreground">
            Comprobación e instalación automática de nuevas versiones.
          </p>
        </div>
        <UpdatesSection />
        <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Comprobar automáticamente</p>
              <p className="text-xs text-muted-foreground">Al iniciar y según el intervalo</p>
            </div>
            <Switch checked={form.autoCheck} onCheckedChange={(checked) => set('autoCheck', checked)} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Descargar automáticamente</p>
              <p className="text-xs text-muted-foreground">La instalación sigue siendo manual</p>
            </div>
            <Switch checked={form.autoDownload} onCheckedChange={(checked) => set('autoDownload', checked)} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Licencia</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Plan y estado de activación. La clave se verifica sin conexión mediante firma digital.
          </p>
        </div>
        <LicenseSection />
      </section>
    </div>
  )
}
