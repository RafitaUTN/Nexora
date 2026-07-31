import type { DocumentStatus } from '@documind/domain'
import { statusLabels, statusTone } from '@/lib/format'
import { Badge } from '@/components/ui/badge'

export function StatusBadge({ status }: { status: DocumentStatus }): JSX.Element {
  return <Badge tone={statusTone(status)}>{statusLabels[status]}</Badge>
}
