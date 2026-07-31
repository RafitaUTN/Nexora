import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { useToasts, type ToastKind } from '@/lib/toasts'
import { cn } from '@/lib/utils'

const toastIcons: Record<ToastKind, JSX.Element> = {
  info: <Info className="size-4 text-sky-500" />,
  success: <CheckCircle2 className="size-4 text-emerald-500" />,
  warning: <TriangleAlert className="size-4 text-amber-500" />,
  error: <XCircle className="size-4 text-red-500" />,
}

export function Toaster(): JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3 shadow-lg',
            'animate-in slide-in-from-top-2 fade-in',
          )}
        >
          <div className="mt-0.5 shrink-0">{toastIcons[toast.kind]}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight">{toast.title}</p>
            {toast.body ? <p className="mt-0.5 text-xs text-muted-foreground">{toast.body}</p> : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => dismiss(toast.id)}
            aria-label="Cerrar notificación"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
