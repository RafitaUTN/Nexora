import { useEffect, type ReactNode } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/store/auth'
import { LoginPage } from '@/pages/login-page'
import { SetupPage } from '@/pages/setup-page'

/** Compuerta de autenticación: setup → login → app según el estado de la sesión. */
export function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const phase = useAuth((s) => s.phase)
  const init = useAuth((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (phase === 'setup') return <SetupPage />
  if (phase === 'login') return <LoginPage />
  return <>{children}</>
}
