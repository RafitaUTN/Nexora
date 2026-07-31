import { describe, expect, it } from 'vitest'
import { selectBestModel } from './model-selector'

describe('selectBestModel', () => {
  it('devuelve null con lista vacía', () => {
    expect(selectBestModel('openai', [])).toBeNull()
  })

  it('descarta modelos que no son de chat', () => {
    const models = ['text-embedding-3-small', 'whisper-1', 'gpt-4o', 'dall-e-3']
    expect(selectBestModel('openai', models)).toBe('gpt-4o')
  })

  it('prioriza el modelo preferido del proveedor', () => {
    const models = ['gpt-4', 'gpt-4-turbo', 'gpt-4o']
    expect(selectBestModel('openai', models)).toBe('gpt-4o')
  })

  it('elige minis antes que el modelo base en OpenAI', () => {
    const models = ['gpt-4o', 'gpt-4o-mini']
    expect(selectBestModel('openai', models)).toBe('gpt-4o-mini')
  })

  it('respeta el slug de proveedor en OpenRouter', () => {
    const models = [
      'mistralai/mistral-7b-instruct',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/text-embedding-004',
    ]
    expect(selectBestModel('openrouter', models)).toBe('openai/gpt-4o')
  })

  it('usa el primer candidato si no hay preferido', () => {
    const models = ['mi-modelo-raro', 'otro-modelo']
    expect(selectBestModel('ollama', models)).toBe('mi-modelo-raro')
  })

  it('prefiere llama3.2 sobre otras en Ollama', () => {
    const models = ['llama3.1', 'llama3.2', 'gemma2']
    expect(selectBestModel('ollama', models)).toBe('llama3.2')
  })

  it('elige el preferido de Gemini aunque venga con prefijo models/', () => {
    const models = ['gemini-2.0-flash', 'models/gemini-pro']
    expect(selectBestModel('gemini', models)).toBe('gemini-2.0-flash')
  })
})
