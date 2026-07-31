import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/store/auth'

export function SetupPage(): JSX.Element {
  const navigate = useNavigate()
  const setup = useAuth((s) => s.setup)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    setBusy(true)
    try {
      await setup({
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        password,
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la configuración')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Rocket className="size-5" />
          </div>
          <CardTitle>Bienvenido a DocuMind</CardTitle>
          <CardDescription>
            Crea el usuario administrador. Este será el primero y único con permisos de gestión.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="setup-username">Nombre de usuario</Label>
              <Input
                id="setup-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-display">Nombre para mostrar</Label>
              <Input
                id="setup-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-password">Contraseña (mínimo 8 caracteres)</Label>
              <Input
                id="setup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-confirm">Repite la contraseña</Label>
              <Input
                id="setup-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !username.trim() || password.length < 8 || password !== confirm}
            >
              {busy ? <Spinner /> : null}
              Crear administrador
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
