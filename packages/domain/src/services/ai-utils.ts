import { createHash } from 'node:crypto'

/** Hash estable de una petición de IA (modelo + mensajes) para la caché. */
export function requestHash(model: string, messages: unknown[]): string {
  return createHash('sha256').update(`${model}|${JSON.stringify(messages)}`).digest('hex')
}

/** Estimación de coste (USD) por tokens, barato para modelos «mini». */
export function estimateCost(
  model: string,
  usage: { promptTokens: number; completionTokens: number },
): number {
  const cheap = model.toLowerCase().includes('mini')
  const perMillionInput = cheap ? 0.15 : 1.0
  const perMillionOutput = cheap ? 0.6 : 3.0
  return (
    (usage.promptTokens / 1_000_000) * perMillionInput +
    (usage.completionTokens / 1_000_000) * perMillionOutput
  )
}

/** Extrae JSON de la respuesta del proveedor, tolerando bloques markdown. */
export function parseJson<T>(content: string): T | null {
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned) as T
  } catch {
    return null
  }
}
