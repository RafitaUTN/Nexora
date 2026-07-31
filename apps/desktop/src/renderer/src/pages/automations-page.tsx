import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Plus, Trash2 } from 'lucide-react'
import type { AutomationTrigger } from '@documind/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { queryKeys } from '@/lib/query-keys'
import { useToasts } from '@/lib/toasts'

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  'document:indexed': 'Documento indexado',
  'document:classified': 'Documento clasificado',
  'schedule:daily': 'Programada: diaria',
  'schedule:weekly': 'Programada: semanal',
}

type ActionType = 'tag' | 'classify'

function actionSummary(action: { type: string; tagNames?: string[]; targetDir?: string; pattern?: string }): string {
  switch (action.type) {
    case 'tag':
      return `Etiquetar: ${action.tagNames?.join(', ') ?? ''}`
    case 'classify':
      return 'Clasificar con IA'
    case 'move':
      return `Mover a ${action.targetDir ?? ''}`
    case 'rename':
      return `Renombrar (${action.pattern ?? ''})`
    default:
      return action.type
  }
}

export function AutomationsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)

  const automations = useQuery({ queryKey: queryKeys.automations, queryFn: () => window.api.automations.list() })

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState<AutomationTrigger>('document:indexed')
  const [actionType, setActionType] = useState<ActionType>('classify')
  const [tagNames, setTagNames] = useState('')
  const [pendingRemove, setPendingRemove] = useState<number | null>(null)

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.automations })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      window.api.automations.create({
        name: name.trim(),
        enabled: true,
        triggerType: trigger,
        action:
          actionType === 'tag'
            ? {
                type: 'tag',
                tagNames: tagNames
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              }
            : { type: 'classify' },
      }),
    onSuccess: () => {
      invalidate()
      push({ kind: 'success', title: 'Automatización creada' })
      setCreateOpen(false)
      setName('')
      setTrigger('document:indexed')
      setActionType('classify')
      setTagNames('')
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo crear la automatización', body: error.message }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      window.api.automations.setEnabled(id, enabled),
    onSuccess: () => invalidate(),
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo actualizar', body: error.message }),
  })

  const removeMutation = useMutation({
    mutationFn: (id: number) => window.api.automations.remove(id),
    onSuccess: () => {
      invalidate()
      push({ kind: 'success', title: 'Automatización eliminada' })
      setPendingRemove(null)
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo eliminar', body: error.message }),
  })

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (!name.trim()) return
    if (actionType === 'tag' && tagNames.trim().length === 0) return
    createMutation.mutate()
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Automatizaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reglas que reaccionan a eventos de documentos y ejecutan acciones.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Nueva automatización
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {automations.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : automations.data && automations.data.length > 0 ? (
          <ul className="divide-y">
            {automations.data.map((automation) => (
              <li key={automation.id} className="flex items-center gap-3 px-4 py-3">
                <Bot className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{automation.name}</p>
                    <Badge tone={automation.enabled ? 'success' : 'neutral'}>
                      {automation.enabled ? 'Activa' : 'Desactivada'}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    Cuando: {TRIGGER_LABELS[automation.triggerType]} · Acción: {actionSummary(automation.action)}
                  </p>
                </div>
                <Switch
                  checked={automation.enabled}
                  onCheckedChange={(enabled) => toggleMutation.mutate({ id: automation.id, enabled })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${automation.name}`}
                  onClick={() => setPendingRemove(automation.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={<Bot className="size-8" />}
              title="Sin automatizaciones"
              description="Crea reglas como «al indexar un documento, clasifícalo con IA»."
            />
          </div>
        )}
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nueva automatización"
        description="Define qué evento dispara la regla y qué acción ejecuta."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="automation-name">Nombre</Label>
            <Input
              id="automation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Clasificar automáticamente"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="automation-trigger">Evento</Label>
            <Select
              id="automation-trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as AutomationTrigger)}
            >
              <option value="document:indexed">Documento indexado</option>
              <option value="document:classified">Documento clasificado</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="automation-action">Acción</Label>
            <Select id="automation-action" value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
              <option value="classify">Clasificar con IA</option>
              <option value="tag">Asignar etiquetas</option>
            </Select>
          </div>

          {actionType === 'tag' ? (
            <div className="space-y-1.5">
              <Label htmlFor="automation-tags">Etiquetas (separadas por coma)</Label>
              <Input
                id="automation-tags"
                value={tagNames}
                onChange={(e) => setTagNames(e.target.value)}
                placeholder="factura, importante"
              />
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                !name.trim() || createMutation.isPending || (actionType === 'tag' && !tagNames.trim())
              }
            >
              {createMutation.isPending ? <Spinner /> : null}
              Crear
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title="Eliminar automatización"
        description="La regla dejará de ejecutarse. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (pendingRemove !== null) removeMutation.mutate(pendingRemove)
        }}
      />
    </div>
  )
}
