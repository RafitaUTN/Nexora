import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/store/auth'

export function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const login = useAuth((s) => s.login)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyRound className="size-5" />
          </div>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Introduce tus credenciales para acceder a DocuMind.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-username">Usuario</Label>
              <Input
                id="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Contraseña</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !username.trim() || !password}>
              {busy ? <Spinner /> : <LogIn />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
