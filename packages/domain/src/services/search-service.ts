import type { DocumentSummary, PagedResult } from '../entities/document'
import type { SearchRepository } from '../ports/repositories'

export interface SearchHit {
  document: DocumentSummary
  score: number
}

/**
 * Búsqueda full-text sobre el índice FTS5.
 */
export class SearchService {
  constructor(private readonly search: SearchRepository) {}

  async fullText(
    query: string,
    limit = 50,
    filter?: { ext?: string; tagId?: number },
  ): Promise<PagedResult<SearchHit>> {
    const trimmed = query.trim()
    if (!trimmed) return { items: [], nextCursor: null, hasMore: false }
    const hits = await this.search.fullText(trimmed, limit, filter)
    return { items: hits, nextCursor: null, hasMore: hits.length === limit }
  }
}
