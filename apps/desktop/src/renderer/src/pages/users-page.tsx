import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import type { Role } from '@documind/domain'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { queryKeys } from '@/lib/query-keys'
import { useToasts } from '@/lib/toasts'
import { useAuth } from '@/store/auth'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Lector',
}

const ROLE_TONES: Record<Role, 'info' | 'success' | 'neutral'> = {
  admin: 'info',
  editor: 'success',
  viewer: 'neutral',
}

export function UsersPage(): JSX.Element {
  const queryClient = useQueryClient()
  const push = useToasts((s) => s.push)
  const currentUser = useAuth((s) => s.currentUser)

  const users = useQuery({ queryKey: queryKeys.users, queryFn: () => window.api.auth.listUsers() })

  const [createOpen, setCreateOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [password, setPassword] = useState('')
  const [pendingRemove, setPendingRemove] = useState<number | null>(null)

  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      window.api.auth.register({
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        role,
        password,
      }),
    onSuccess: (created) => {
      invalidate()
      push({ kind: 'success', title: `Usuario «${created.username}» creado` })
      setCreateOpen(false)
      setUsername('')
      setDisplayName('')
      setRole('viewer')
      setPassword('')
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo crear el usuario', body: error.message }),
  })

  const setRoleMutation = useMutation({
    mutationFn: ({ userId, nextRole }: { userId: number; nextRole: Role }) =>
      window.api.auth.setRole(userId, nextRole),
    onSuccess: () => invalidate(),
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo cambiar el rol', body: error.message }),
  })

  const removeMutation = useMutation({
    mutationFn: (id: number) => window.api.auth.deleteUser(id),
    onSuccess: () => {
      invalidate()
      push({ kind: 'success', title: 'Usuario eliminado' })
      setPendingRemove(null)
    },
    onError: (error: Error) => push({ kind: 'error', title: 'No se pudo eliminar', body: error.message }),
  })

  const changePasswordMutation = useMutation({
    mutationFn: () => window.api.auth.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      push({ kind: 'success', title: 'Contraseña actualizada' })
      setPasswordOpen(false)
      setCurrentPassword('')
      setNewPassword('')
    },
    onError: (error: Error) =>
      push({ kind: 'error', title: 'No se pudo cambiar la contraseña', body: error.message }),
  })

  const onCreate = (event: FormEvent): void => {
    event.preventDefault()
    if (!username.trim() || password.length < 8) return
    createMutation.mutate()
  }

  const onChangePassword = (event: FormEvent): void => {
    event.preventDefault()
    if (!currentPassword || newPassword.length < 8) return
    changePasswordMutation.mutate()
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestiona el acceso a DocuMind por roles. Solo los administradores pueden crear o modificar usuarios.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPasswordOpen(true)}>
            <KeyRound />
            Cambiar contraseña
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Nuevo usuario
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {users.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : users.data && users.data.length > 0 ? (
          <ul className="divide-y">
            {users.data.map((user) => (
              <li key={user.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                  {user.role === 'admin' ? (
                    <ShieldCheck className="size-4 text-primary" />
                  ) : (
                    <UserRound className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{user.displayName}</p>
                    <span className="text-xs text-muted-foreground">@{user.username}</span>
                    {user.id === currentUser?.id ? (
                      <Badge tone="info">Tú</Badge>
                    ) : null}
                    <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                  </div>
                </div>
                <Select
                  value={user.role}
                  aria-label={`Rol de ${user.username}`}
                  onChange={(e) => setRoleMutation.mutate({ userId: user.id, nextRole: e.target.value as Role })}
                  disabled={setRoleMutation.isPending}
                  className="w-40"
                >
                  <option value="admin">Administrador</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Lector</option>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${user.username}`}
                  onClick={() => setPendingRemove(user.id)}
                  disabled={user.id === currentUser?.id}
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
              icon={<UserRound className="size-8" />}
              title="Sin usuarios"
              description="Crea el primer usuario para poder iniciar sesión."
            />
          </div>
        )}
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo usuario"
        description="El usuario podrá iniciar sesión en cuanto se cree."
      >
        <form onSubmit={onCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="user-username">Nombre de usuario</Label>
            <Input
              id="user-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="p. ej. ana"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-display">Nombre para mostrar</Label>
            <Input
              id="user-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-role">Rol</Label>
            <Select id="user-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="viewer">Lector</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-password">Contraseña (mínimo 8 caracteres)</Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!username.trim() || password.length < 8 || createMutation.isPending}>
              {createMutation.isPending ? <Spinner /> : null}
              Crear
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Cambiar contraseña"
        description="Se cerrarán las demás sesiones abiertas de tu usuario."
      >
        <form onSubmit={onChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">Contraseña actual</Label>
            <Input
              id="pw-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">Nueva contraseña</Label>
            <Input
              id="pw-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!currentPassword || newPassword.length < 8 || changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? <Spinner /> : null}
              Guardar
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        title="Eliminar usuario"
        description="El usuario perderá el acceso y sus sesiones se cerrarán. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (pendingRemove !== null) removeMutation.mutate(pendingRemove)
        }}
      />
    </div>
  )
}
