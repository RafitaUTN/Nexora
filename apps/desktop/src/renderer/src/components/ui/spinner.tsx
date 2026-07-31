import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }): JSX.Element {
  return <Loader2 className={cn('size-4 animate-spin', className)} />
}
