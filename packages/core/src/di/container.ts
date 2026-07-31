import type { AppError } from '@documind/shared'

type Factory<T> = () => T

/**
 * Contenedor de dependencias mínimo (composition root).
 * Registra adaptadores concretos contra los puertos del dominio.
 */
export class Container {
  private readonly registry = new Map<string, Factory<unknown>>()
  private readonly instances = new Map<string, unknown>()

  register<T>(token: string, factory: Factory<T>): void {
    this.registry.set(token, factory as Factory<unknown>)
  }

  registerSingleton<T>(token: string, factory: Factory<T>): void {
    this.registry.set(token, () => {
      if (!this.instances.has(token)) {
        this.instances.set(token, factory())
      }
      return this.instances.get(token)
    })
  }

  resolve<T>(token: string): T {
    const factory = this.registry.get(token)
    if (!factory) {
      throw new Error(`Dependencia no registrada: ${token}`)
    }
    return factory() as T
  }

  has(token: string): boolean {
    return this.registry.has(token)
  }

  clear(): void {
    this.registry.clear()
    this.instances.clear()
  }
}

export function toAppError(error: unknown): AppError {
  if (error && typeof error === 'object' && 'code' in error) {
    return error as AppError
  }
  return { code: 'ERR_UNKNOWN', message: error instanceof Error ? error.message : String(error) }
}
