import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Save, Trash2, Wifi } from 'lucide-react'
import type { AppSettings, ProviderId } from '@documind/domain'
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
  model: string
  tokenBudget: string
  sendWholeDocument: boolean
  maxCacheAgeDays: string
  requestsPerMinute: string
}

function toForm(settings: AppSettings): SettingsForm {
  return {
    theme: settings.theme,
    language: settings.language,
    ocrLanguages: settings.ocrLanguages.join(', '),
    ocrMaxDpi: String(settings.ocrMaxDpi),
    telemetry: settings.telemetry,
    provider: settings.ai.provider ?? '',
    model: settings.ai.model,
    tokenBudget: String(settings.ai.tokenBudget),
    sendWholeDocument: settings.ai.sendWholeDocument,
    maxCacheAgeDays: String(settings.ai.maxCacheAgeDays),
    requestsPerMinute: String(settings.ai.requestsPerMinute),
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
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo guardar la clave', body: error.message }),
  })

  const deleteKeyMutation = useMutation({
    mutationFn: () => window.api.ai.deleteApiKey(provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKey(provider) })
      push({ kind: 'success', title: `Clave eliminada para ${PROVIDER_LABELS[provider]}` })
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo eliminar la clave', body: error.message }),
  })

  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">{PROVIDER_LABELS[provider]}</p>
          {status.data ? (
            <Badge tone={status.data.set ? 'success' : 'neutral'}>{status.data.set ? 'Configurada' : 'Sin clave'}</Badge>
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

export function SettingsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: () => window.api.settings.get() })
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (settings.data && !dirty) setForm(toForm(settings.data))
  }, [settings.data, dirty])

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
          model: form.model,
          tokenBudget: Number(form.tokenBudget),
          sendWholeDocument: form.sendWholeDocument,
          maxCacheAgeDays: Number(form.maxCacheAgeDays),
          requestsPerMinute: Number(form.requestsPerMinute),
        },
      })
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings })
      setForm(toForm(saved))
      setDirty(false)
      push({ kind: 'success', title: 'Ajustes guardados' })
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudieron guardar los ajustes', body: error.message }),
  })

  const healthMutation = useMutation({
    mutationFn: () => window.api.ai.health(),
    onSuccess: (health) => {
      push(
        health.ok
          ? { kind: 'success', title: 'IA disponible', body: `Latencia ${health.latencyMs} ms` }
          : { kind: 'warning', title: 'IA no disponible', body: health.error ?? 'Sin conexión' },
      )
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo comprobar la IA', body: error.message }),
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
            <Select id="settings-theme" value={form.theme} onChange={(e) => set('theme', e.target.value as SettingsForm['theme'])}>
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-language">Idioma</Label>
            <Select id="settings-language" value={form.language} onChange={(e) => set('language', e.target.value as SettingsForm['language'])}>
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
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-ocr-langs">Idiomas (códigos, separados por coma)</Label>
            <Input
              id="settings-ocr-langs"
              value={form.ocrLanguages}
              onChange={(e) => set('ocrLanguages', e.target.value)}
              placeholder="spa, eng"
            />
            <p className="text-xs text-muted-foreground">Ej.: spa, eng, fra, por</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-ocr-dpi">DPI máximo (72–600)</Label>
            <Input
              id="settings-ocr-dpi"
              type="number"
              min={72}
              max={600}
              value={form.ocrMaxDpi}
              onChange={(e) => set('ocrMaxDpi', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-base font-semibold">Inteligencia artificial</h2>
            <p className="text-xs text-muted-foreground">Clasificación y extracción de entidades</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => healthMutation.mutate()} disabled={healthMutation.isPending}>
            {healthMutation.isPending ? <Spinner /> : <Wifi />}
            Comprobar conexión
          </Button>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-provider">Proveedor</Label>
            <Select id="settings-provider" value={form.provider} onChange={(e) => set('provider', e.target.value)}>
              <option value="">Ninguno</option>
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {PROVIDER_LABELS[provider]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-model">Modelo</Label>
            <Input
              id="settings-model"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder="p. ej. gpt-4o-mini"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-token-budget">Presupuesto de tokens</Label>
            <Input
              id="settings-token-budget"
              type="number"
              min={256}
              max={64000}
              value={form.tokenBudget}
              onChange={(e) => set('tokenBudget', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-cache-days">Validez de caché (días)</Label>
            <Input
              id="settings-cache-days"
              type="number"
              min={1}
              max={365}
              value={form.maxCacheAgeDays}
              onChange={(e) => set('maxCacheAgeDays', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-rpm">Peticiones por minuto</Label>
            <Input
              id="settings-rpm"
              type="number"
              min={1}
              max={600}
              value={form.requestsPerMinute}
              onChange={(e) => set('requestsPerMinute', e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Enviar documento completo</p>
              <p className="text-xs text-muted-foreground">Si no, se envía un extracto</p>
            </div>
            <Switch checked={form.sendWholeDocument} onCheckedChange={(checked) => set('sendWholeDocument', checked)} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">Claves de API</h2>
          <p className="text-xs text-muted-foreground">Se guardan de forma segura en el sistema.</p>
        </div>
        <div className="divide-y">
          {PROVIDERS.map((provider) => (
            <ProviderApiKeyRow key={provider} provider={provider} />
          ))}
        </div>
      </section>
    </div>
  )
}
