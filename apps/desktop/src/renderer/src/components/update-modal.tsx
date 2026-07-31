import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, RefreshCw, Rocket } from 'lucide-react'
import { IpcEvent } from '@documind/shared'
import type { UpdateStatus } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useToasts } from '@/lib/toasts'

/**
 * Modal global de actualizaciones. Reacciona a los eventos del proceso
 * principal: cuando una nueva versión está disponible muestra un diálogo que
 * informa del cambio y permite descargar/instalar. El usuario puede
 * posponerlo («Más tarde»): el diálogo no reaparece para la misma versión.
 */
export function UpdateModal(): JSX.Element {
  const push = useToasts((s) => s.push)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [open, setOpen] = useState(false)
  const dismissedVersion = useRef<string | null>(null)

  useEffect(() => {
    void window.api.updates.state().then(setStatus)
    return window.api.on<UpdateStatus>(IpcEvent.EventUpdateStatus, (next) => {
      setStatus(next)
      if (next.status === 'available' && next.latestVersion !== dismissedVersion.current) {
        setOpen(true)
      }
      if (next.status === 'current' || next.status === 'error') {
        setOpen(false)
      }
    })
  }, [])

  const downloadMutation = useMutation({
    mutationFn: () => window.api.updates.download(),
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo descargar', body: error.message }),
  })

  const installMutation = useMutation({
    mutationFn: () => window.api.updates.install(),
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo instalar', body: error.message }),
  })

  const close = (): void => {
    if (status?.latestVersion) dismissedVersion.current = status.latestVersion
    setOpen(false)
  }

  const visible =
    status?.status === 'available' || status?.status === 'downloading' || status?.status === 'downloaded'

  const current = status?.currentVersion
  const latest = status?.latestVersion

  let footer = (
    <>
      <Button variant="outline" onClick={close}>
        Más tarde
      </Button>
      <Button onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}>
        {downloadMutation.isPending ? <Spinner /> : <Download />}
        Descargar e instalar
      </Button>
    </>
  )
  if (status?.status === 'downloaded') {
    footer = (
      <>
        <Button variant="outline" onClick={close}>
          Más tarde
        </Button>
        <Button onClick={() => installMutation.mutate()} disabled={installMutation.isPending}>
          {installMutation.isPending ? <Spinner /> : <Rocket />}
          Reiniciar e instalar
        </Button>
      </>
    )
  }

  return (
    <Dialog
      open={open && visible}
      onClose={close}
      title={latest ? `Nueva versión ${latest} disponible` : 'Actualización disponible'}
      description={
        current
          ? `Estás usando DocuMind ${current}. ¿Quieres instalar la nueva versión ahora?`
          : undefined
      }
      footer={footer}
    >
      {status?.status === 'downloading' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin" />
            Descargando actualización…
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${status.progress ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{status.progress ?? 0}%</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Al instalar, DocuMind se reiniciará automáticamente para aplicar los cambios.
        </p>
      )}
    </Dialog>
  )
}
