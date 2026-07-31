import { describe, expect, it } from 'vitest'
import { SearchService } from './search-service'
import { FakeSearchRepository, makeDocumentSummary } from '../test/fakes'

describe('SearchService', () => {
  it('devuelve vacío con consulta en blanco', async () => {
    const service = new SearchService(new FakeSearchRepository())
    const result = await service.fullText('   ')
    expect(result.items).toHaveLength(0)
    expect(result.hasMore).toBe(false)
  })

  it('hits==limit marca hasMore=true', async () => {
    const repo = new FakeSearchRepository()
    repo.hits = Array.from({ length: 3 }, (_, i) => ({ document: makeDocumentSummary({ id: i, filename: `d${i}` }), score: 1 }))
    const service = new SearchService(repo)
    const result = await service.fullText('factura', 3)
    expect(result.hasMore).toBe(true)
  })

  it('envía el filtro de extensión y etiqueta al repositorio', async () => {
    let received: unknown
    const repo = {
      async fullText(query: string, _limit: number, filter: unknown) {
        received = { query, filter }
        return []
      },
    }
    const service = new SearchService(repo)
    await service.fullText('contrato', 10, { ext: 'pdf', tagId: 2 })
    expect(received).toEqual({ query: 'contrato', filter: { ext: 'pdf', tagId: 2 } })
  })
})
