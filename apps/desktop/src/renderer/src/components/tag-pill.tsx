import { cn } from '@/lib/utils'

export interface TagPillProps {
  name: string
  color?: string | null
  className?: string
  onRemove?: () => void
}

export function TagPill({ name, color, className, onRemove }: TagPillProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground',
        className,
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color ?? '#64748b' }} />
      <span className="max-w-[12rem] truncate">{name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar etiqueta ${name}`}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
    </span>
  )
}
