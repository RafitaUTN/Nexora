import type { AiCacheRepository, AiUsageRepository } from '@documind/domain'
import type { SqliteDatabase } from '../database'

export class SqliteAiCacheRepository implements AiCacheRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async get(requestHash: string): Promise<string | null> {
    const row = this.db
      .prepare(
        `SELECT response FROM ai_cache
         WHERE request_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      )
      .get(requestHash) as { response: string } | undefined
    return row?.response ?? null
  }

  async set(requestHash: string, response: string, ttlSeconds?: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ai_cache (request_hash, provider, model, response, expires_at)
         VALUES (?, '', '', ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', '+' || ? || ' seconds') END)
         ON CONFLICT(request_hash) DO UPDATE SET
           response = excluded.response,
           expires_at = excluded.expires_at`,
      )
      .run(requestHash, response, ttlSeconds ?? null, ttlSeconds ?? null)
  }
}

export class SqliteAiUsageRepository implements AiUsageRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async record(usage: {
    provider: string
    model: string
    task: string
    promptTokens: number
    completionTokens: number
    estCostUsd: number
    latencyMs: number
    cached: boolean
  }): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ai_usage
           (provider, model, task, prompt_tokens, completion_tokens, est_cost_usd, latency_ms, cached)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        usage.provider,
        usage.model,
        usage.task,
        usage.promptTokens,
        usage.completionTokens,
        usage.estCostUsd,
        usage.latencyMs,
        usage.cached ? 1 : 0,
      )
  }

  async summarize(): Promise<{
    totalCalls: number
    totalTokens: number
    totalCostUsd: number
    cachedHits: number
  }> {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS totalCalls,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS totalTokens,
                COALESCE(SUM(est_cost_usd), 0) AS totalCostUsd,
                COALESCE(SUM(cached), 0) AS cachedHits
         FROM ai_usage`,
      )
      .get() as { totalCalls: number; totalTokens: number; totalCostUsd: number; cachedHits: number }
    return row
  }
}
