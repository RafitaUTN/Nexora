import type { NewAuditEntry, AuditEntry } from '../entities/audit'
import type { AuditRepository } from '../ports/repositories'

/**
 * Registro de auditoría de acciones sensibles.
 */
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  async record(entry: NewAuditEntry): Promise<void> {
    await this.audit.add(entry)
  }

  async list(limit = 100, cursor?: number): Promise<AuditEntry[]> {
    return this.audit.list(limit, cursor)
  }
}
