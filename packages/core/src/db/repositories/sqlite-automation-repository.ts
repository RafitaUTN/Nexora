import type { Automation, NewAutomation, AutomationRepository } from '@documind/domain'
import { automationActionSchema, automationTriggerSchema } from '@documind/domain'
import type { SqliteDatabase } from '../database'

interface AutomationRow {
  id: number
  name: string
  enabled: number
  trigger_type: string
  action_type: string
  config: string
  created_at: string
  updated_at: string
}

function toAutomation(row: AutomationRow): Automation {
  const trigger = automationTriggerSchema.parse(row.trigger_type)
  const action = automationActionSchema.parse(JSON.parse(row.config))
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    triggerType: trigger,
    action,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SqliteAutomationRepository implements AutomationRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async list(enabledOnly = false): Promise<Automation[]> {
    const where = enabledOnly ? 'WHERE enabled = 1' : ''
    const rows = this.db
      .prepare(`SELECT * FROM automations ${where} ORDER BY id`)
      .all() as AutomationRow[]
    return rows.map(toAutomation)
  }

  async create(automation: NewAutomation): Promise<Automation> {
    const info = this.db
      .prepare(
        `INSERT INTO automations (name, enabled, trigger_type, action_type, config)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        automation.name,
        automation.enabled ? 1 : 0,
        automation.triggerType,
        automation.action.type,
        JSON.stringify(automation.action),
      )
    const id = Number(info.lastInsertRowid)
    const row = this.db.prepare(`SELECT * FROM automations WHERE id = ?`).get(id) as AutomationRow
    return toAutomation(row)
  }

  async updateEnabled(id: number, enabled: boolean): Promise<void> {
    this.db
      .prepare(`UPDATE automations SET enabled = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(enabled ? 1 : 0, id)
  }

  async delete(id: number): Promise<void> {
    this.db.prepare(`DELETE FROM automations WHERE id = ?`).run(id)
  }

  async recordRun(
    automationId: number,
    documentId: number,
    ok: boolean,
    detail: string,
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO automation_runs (automation_id, document_id, status, detail) VALUES (?, ?, ?, ?)`,
      )
      .run(automationId, documentId, ok ? 'success' : 'error', detail)
  }
}
