import type { ChatRequest, ChatResponse, ProviderHealth } from './ai-contracts'
import type { ProviderId } from '../entities/settings'

/**
 * Puerto de IA. El dominio nunca depende de un proveedor concreto;
 * los adaptadores (OpenRouter, OpenAI, Gemini, Claude, Ollama) lo implementan.
 */
export interface AIProvider {
  readonly id: ProviderId
  chat(req: ChatRequest): Promise<ChatResponse>
  health(): Promise<ProviderHealth>
  /** Lista de modelos disponibles para el usuario (p. ej. GET /models). */
  listModels(): Promise<string[]>
}

export type { ChatRequest, ChatResponse, ProviderHealth }
