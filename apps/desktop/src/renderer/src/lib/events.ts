import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { IpcEvent } from '@documind/shared'
import { useToasts, type ToastKind } from './toasts'
import { queryKeys } from './query-keys'

export function useAppEvents(): void {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  useEffect(() => {
    const invalidateDocuments = (): void => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents })
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats })
    }
    const subs = [
      window.api.on<{ level: ToastKind; title: string; body?: string }>(
        IpcEvent.EventNotification,
        (notification) => push({ kind: notification.level, title: notification.title, body: notification.body }),
      ),
      window.api.on(IpcEvent.EventDocumentIndexed, () => invalidateDocuments()),
      window.api.on(IpcEvent.EventDocumentStatus, () => invalidateDocuments()),
      window.api.on(IpcEvent.EventIndexProgress, () => invalidateDocuments()),
    ]
    return () => {
      subs.forEach((unsubscribe) => unsubscribe())
    }
  }, [queryClient, push])
}
