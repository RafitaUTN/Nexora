import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Cloud,
  Download,
  KeyRound,
  LogOut,
  RefreshCw,
  Save,
  Share2,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserX,
  Wifi,
} from 'lucide-react'
import { IpcEvent } from '@documind/shared'
import type {
  AppSettings,
  License,
  LicenseKey,
  LicenseTier,
  ProviderId,
  Share,
  ShareRole,
  ShareStatus,
  SyncStatus,
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
  model: string
  tokenBudget: string
  sendWholeDocument: boolean
  maxCacheAgeDays: string
  requestsPerMinute: string
  autoCheck: boolean
  autoDownload: boolean
  channel: 'stable' | 'beta'
  checkIntervalHours: string
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
    autoCheck: settings.updates.autoCheck,
    autoDownload: settings.updates.autoDownload,
    channel: settings.updates.channel,
    checkIntervalHours: String(settings.updates.checkIntervalHours),
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

const SHARE_ROLE_LABELS: Record<ShareRole, string> = {
  viewer: 'Solo lectura',
  editor: 'Edición',
}

const SHARE_STATUS_META: Record<ShareStatus, { label: string; tone: 'info' | 'success' | 'error' }> = {
  invited: { label: 'Invitado', tone: 'info' },
  active: { label: 'Activo', tone: 'success' },
  revoked: { label: 'Revocado', tone: 'error' },
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
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo desactivar', body: error.message }),
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
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo descargar', body: error.message }),
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

function SyncSection(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const currentUser = useAuth((s) => s.currentUser)
  const isAdmin = currentUser?.role === 'admin'
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const sync = useQuery({ queryKey: queryKeys.sync, queryFn: () => window.api.sync.status() })

  const setEnabledMutation = useMutation({
    mutationFn: (enabled: boolean) => window.api.sync.setEnabled(enabled),
    onSuccess: (status) => {
      void queryClient.setQueryData<SyncStatus>(queryKeys.sync, status)
      push({ kind: 'success', title: status.enabled ? 'Sincronización habilitada' : 'Sincronización deshabilitada' })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo cambiar el estado', body: error.message }),
  })

  const configureMutation = useMutation({
    mutationFn: () => window.api.sync.configure(url.trim(), anonKey.trim(), email.trim(), password),
    onSuccess: (status) => {
      void queryClient.setQueryData<SyncStatus>(queryKeys.sync, status)
      setUrl('')
      setAnonKey('')
      setEmail('')
      setPassword('')
      push({ kind: 'success', title: 'Cuenta conectada', body: `Sincronizando como ${status.email}` })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo conectar', body: error.message }),
  })

  const signUpMutation = useMutation({
    mutationFn: () => window.api.sync.signUp(url.trim(), anonKey.trim(), email.trim(), password),
    onSuccess: (result) => {
      if (result.status) void queryClient.setQueryData<SyncStatus>(queryKeys.sync, result.status)
      push(
        result.confirmationRequired
          ? {
              kind: 'info',
              title: 'Confirmación de correo pendiente',
              body: 'Confirma el correo en Supabase y luego conecta la cuenta aquí.',
            }
          : { kind: 'success', title: 'Cuenta creada y conectada' },
      )
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo crear la cuenta', body: error.message }),
  })

  const signOutMutation = useMutation({
    mutationFn: () => window.api.sync.signOut(),
    onSuccess: (status) => {
      void queryClient.setQueryData<SyncStatus>(queryKeys.sync, status)
      push({ kind: 'success', title: 'Cuenta desconectada' })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo desconectar', body: error.message }),
  })

  const pingMutation = useMutation({
    mutationFn: () => window.api.sync.ping(),
    onSuccess: () => push({ kind: 'success', title: 'Servidor alcanzable' }),
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo contactar con el servidor', body: error.message }),
  })

  const runMutation = useMutation({
    mutationFn: () => window.api.sync.run(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sync })
      push({
        kind: 'success',
        title: 'Sincronización completada',
        body: `${result.pushed} subidos · ${result.pulled} recibidos · ${result.applied} aplicados`,
      })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo sincronizar', body: error.message }),
  })

  const status = sync.data
  const configured = status?.configured ?? false
  const authenticated = status?.authenticated ?? false

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={status?.enabled ? 'success' : 'neutral'}>
            {status?.enabled ? 'Habilitada' : 'Deshabilitada'}
          </Badge>
          <Badge tone={configured ? 'info' : 'neutral'}>
            {configured ? 'Configurada' : 'Sin configurar'}
          </Badge>
          {authenticated ? (
            <Badge tone="success">Cuenta: {status?.email}</Badge>
          ) : configured ? (
            <Badge tone="warning">Sin cuenta conectada</Badge>
          ) : null}
          {status?.deviceId ? (
            <p className="text-xs text-muted-foreground">Dispositivo {status.deviceId.slice(0, 8)}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => pingMutation.mutate()}
            disabled={pingMutation.isPending || !configured}
          >
            {pingMutation.isPending ? <Spinner /> : <Wifi />}
            Probar conexión
          </Button>
          <Button
            size="sm"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !configured || !status?.enabled}
          >
            {runMutation.isPending ? <Spinner /> : <RefreshCw />}
            Sincronizar ahora
          </Button>
          {authenticated ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
            >
              {signOutMutation.isPending ? <Spinner /> : <LogOut />}
              Desconectar
            </Button>
          ) : null}
        </div>
      </div>

      {status?.pending !== undefined && status.pending > 0 ? (
        <p className="text-xs text-muted-foreground">{status.pending} cambios locales pendientes de subir</p>
      ) : null}

      {isAdmin ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-56 space-y-1.5">
              <Label htmlFor="sync-url">URL del proyecto Supabase</Label>
              <Input
                id="sync-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                disabled={configureMutation.isPending}
              />
            </div>
            <div className="min-w-0 flex-1 basis-56 space-y-1.5">
              <Label htmlFor="sync-anon-key">Clave anon (publishable)</Label>
              <Input
                id="sync-anon-key"
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs…"
                disabled={configureMutation.isPending}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-56 space-y-1.5">
              <Label htmlFor="sync-email">Correo de la cuenta Supabase</Label>
              <Input
                id="sync-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                disabled={configureMutation.isPending || signUpMutation.isPending}
              />
            </div>
            <div className="min-w-0 flex-1 basis-56 space-y-1.5">
              <Label htmlFor="sync-password">Contraseña</Label>
              <Input
                id="sync-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={configureMutation.isPending || signUpMutation.isPending}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => configureMutation.mutate()}
              disabled={
                !url.trim() ||
                !anonKey.trim() ||
                !email.trim() ||
                !password ||
                configureMutation.isPending ||
                signUpMutation.isPending
              }
            >
              {configureMutation.isPending ? <Spinner /> : <Cloud />}
              Conectar cuenta
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signUpMutation.mutate()}
              disabled={
                !url.trim() ||
                !anonKey.trim() ||
                !email.trim() ||
                password.length < 8 ||
                configureMutation.isPending ||
                signUpMutation.isPending
              }
            >
              {signUpMutation.isPending ? <Spinner /> : <KeyRound />}
              Crear cuenta
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            La contraseña se usa una sola vez para obtener la sesión de Supabase; solo se guarda el
            token cifrado en este dispositivo.
          </p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Sincronización activa</p>
              <p className="text-xs text-muted-foreground">
                Replica documentos, etiquetas y asignaciones entre dispositivos (LWW)
              </p>
            </div>
            <Switch
              checked={status?.enabled ?? false}
              onCheckedChange={(checked) => setEnabledMutation.mutate(checked)}
              disabled={!configured || setEnabledMutation.isPending}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function SharesSection(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const currentUser = useAuth((s) => s.currentUser)
  const isAdmin = currentUser?.role === 'admin'
  const [memberEmail, setMemberEmail] = useState('')
  const [role, setRole] = useState<ShareRole>('viewer')

  const sync = useQuery({ queryKey: queryKeys.sync, queryFn: () => window.api.sync.status() })
  const outgoing = useQuery({
    queryKey: queryKeys.sharesOutgoing,
    queryFn: () => window.api.shares.outgoing(),
  })
  const incoming = useQuery({
    queryKey: queryKeys.sharesIncoming,
    queryFn: () => window.api.shares.incoming(),
  })

  useEffect(
    () => window.api.on(IpcEvent.EventSharesChanged, () => void queryClient.invalidateQueries({ queryKey: queryKeys.shares })),
    [queryClient],
  )

  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: queryKeys.shares })

  const inviteMutation = useMutation({
    mutationFn: () => window.api.shares.invite(memberEmail.trim(), role),
    onSuccess: (share: Share) => {
      invalidate()
      setMemberEmail('')
      push({
        kind: 'success',
        title: 'Invitación enviada',
        body: `${share.memberEmail} · ${SHARE_ROLE_LABELS[share.role]}`,
      })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo invitar', body: error.message }),
  })

  const acceptMutation = useMutation({
    mutationFn: (uid: string) => window.api.shares.accept(uid),
    onSuccess: (share: Share) => {
      invalidate()
      push({ kind: 'success', title: 'Biblioteca aceptada', body: share.ownerEmail })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo aceptar', body: error.message }),
  })

  const revokeMutation = useMutation({
    mutationFn: (uid: string) => window.api.shares.revoke(uid),
    onSuccess: (share: Share) => {
      invalidate()
      push({ kind: 'success', title: 'Acceso revocado', body: share.memberEmail })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo revocar', body: error.message }),
  })

  const setRoleMutation = useMutation({
    mutationFn: (payload: { uid: string; role: ShareRole }) => window.api.shares.setRole(payload.uid, payload.role),
    onSuccess: (share: Share) => {
      invalidate()
      push({
        kind: 'success',
        title: 'Rol actualizado',
        body: `${share.memberEmail} · ${SHARE_ROLE_LABELS[share.role]}`,
      })
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo cambiar el rol', body: error.message }),
  })

  const authenticated = sync.data?.authenticated ?? false
  const pending = (incoming.data ?? []).filter((s) => s.status === 'invited')
  const activeOutgoing = (outgoing.data ?? []).filter((s) => s.status !== 'revoked')

  if (!authenticated) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          Conecta una cuenta de sincronización para compartir tu biblioteca con otros usuarios.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {pending.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Invitaciones recibidas</p>
          {pending.map((share) => (
            <div
              key={share.uid}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{share.ownerEmail}</p>
                <p className="text-xs text-muted-foreground">
                  Te ha invitado a su biblioteca · {SHARE_ROLE_LABELS[share.role]}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => acceptMutation.mutate(share.uid)}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? <Spinner /> : <UserPlus />}
                Aceptar
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {isAdmin ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-56 space-y-1.5">
              <Label htmlFor="share-email">Correo del usuario invitado</Label>
              <Input
                id="share-email"
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                disabled={inviteMutation.isPending}
              />
            </div>
            <div className="min-w-0 flex-1 basis-40 space-y-1.5">
              <Label htmlFor="share-role">Acceso</Label>
              <Select
                id="share-role"
                value={role}
                onChange={(e) => setRole(e.target.value as ShareRole)}
              >
                <option value="viewer">Solo lectura</option>
                <option value="editor">Edición</option>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={!memberEmail.trim() || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? <Spinner /> : <UserPlus />}
              Invitar
            </Button>
          </div>

          {activeOutgoing.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Compartida con</p>
              {activeOutgoing.map((share) => {
                const meta = SHARE_STATUS_META[share.status]
                return (
                  <div
                    key={share.uid}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{share.memberEmail}</p>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <Badge tone={share.role === 'editor' ? 'info' : 'neutral'}>
                        {SHARE_ROLE_LABELS[share.role]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        aria-label={`Rol de ${share.memberEmail}`}
                        value={share.role}
                        onChange={(e) =>
                          setRoleMutation.mutate({ uid: share.uid, role: e.target.value as ShareRole })
                        }
                        className="w-36"
                      >
                        <option value="viewer">Solo lectura</option>
                        <option value="editor">Edición</option>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Revocar acceso a ${share.memberEmail}`}
                        disabled={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(share.uid)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <UserX />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Aún no compartes tu biblioteca. Invita a un usuario por correo para que pueda leerla
              (o editarla) desde su dispositivo.
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}

export function SettingsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: () => window.api.settings.get() })
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [dirty, setDirty] = useState(false)
  const [lastData, setLastData] = useState<AppSettings | undefined>(settings.data)

  if (settings.data !== lastData && !dirty) {
    setLastData(settings.data)
    setForm(settings.data ? toForm(settings.data) : null)
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
          model: form.model,
          tokenBudget: Number(form.tokenBudget),
          sendWholeDocument: form.sendWholeDocument,
          maxCacheAgeDays: Number(form.maxCacheAgeDays),
          requestsPerMinute: Number(form.requestsPerMinute),
        },
        updates: {
          autoCheck: form.autoCheck,
          autoDownload: form.autoDownload,
          channel: form.channel,
          checkIntervalHours: Number(form.checkIntervalHours),
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
          ? { kind: 'success', title: 'IA disponible', body: `Latencia ${health.latencyMs} ms` }
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
          <div className="space-y-1.5">
            <Label htmlFor="settings-updates-channel">Canal</Label>
            <Select
              id="settings-updates-channel"
              value={form.channel}
              onChange={(e) => set('channel', e.target.value as SettingsForm['channel'])}
            >
              <option value="stable">Estable</option>
              <option value="beta">Beta</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-updates-interval">Comprobar cada (horas, 1–168)</Label>
            <Input
              id="settings-updates-interval"
              type="number"
              min={1}
              max={168}
              value={form.checkIntervalHours}
              onChange={(e) => set('checkIntervalHours', e.target.value)}
            />
          </div>
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

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <Cloud className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Sincronización</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Replica tu biblioteca entre dispositivos mediante Supabase/Postgres.
          </p>
        </div>
        <SyncSection />
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <Share2 className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Compartir</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Invita a otros usuarios a acceder a tu biblioteca desde sus dispositivos.
          </p>
        </div>
        <SharesSection />
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
