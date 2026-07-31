import type { DocumentStatus } from '@documind/domain'

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[i]}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `hace ${days} d`
  return formatDate(iso)
}

export const statusLabels: Record<DocumentStatus, string> = {
  pending: 'Pendiente',
  extracting: 'Extrayendo',
  ocr: 'OCR',
  pending_ocr: 'OCR pendiente',
  ai: 'IA',
  indexed: 'Indexado',
  ready: 'Listo',
  error: 'Error',
}

export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'error'

export function statusTone(status: DocumentStatus): StatusTone {
  switch (status) {
    case 'ready':
      return 'success'
    case 'indexed':
      return 'info'
    case 'error':
      return 'error'
    case 'pending':
      return 'neutral'
    case 'pending_ocr':
    case 'ocr':
    case 'ai':
      return 'warning'
    case 'extracting':
      return 'info'
  }
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`
}
