import type { Automation, AutomationTrigger, NewAutomation } from '../entities/automation'
import type { AutomationRepository } from '../ports/repositories'
import type { EventBus } from '../ports/event-bus'

/**
 * Ejecución de las acciones de una automatización. El proceso principal
 * inyecta la implementación (infraestructura).
 */
export interface AutomationActions {
  tag(documentId: number, tagNames: string[]): Promise<void>
  classify(documentId: number): Promise<void>
}

/**
 * Casos de uso de automatizaciones: reglas que reaccionan a eventos del
 * dominio (documento indexado/clasificado) ejecutando acciones.
 */
export class AutomationService {
  constructor(
    private readonly automations: AutomationRepository,
    private readonly bus: EventBus,
  ) {}

  async list(): Promise<Automation[]> {
    return this.automations.list()
  }

  async create(input: NewAutomation): Promise<Automation> {
    return this.automations.create(input)
  }

  async setEnabled(id: number, enabled: boolean): Promise<void> {
    await this.automations.updateEnabled(id, enabled)
  }

  async remove(id: number): Promise<void> {
    await this.automations.delete(id)
  }

  /** Ejecuta las automatizaciones habilitadas que coinciden con el evento. */
  async runForTrigger(
    trigger: AutomationTrigger,
    documentId: number,
    actions: AutomationActions,
  ): Promise<void> {
    const list = await this.automations.list(true)
    for (const automation of list) {
      if (automation.triggerType !== trigger) continue
      try {
        switch (automation.action.type) {
          case 'tag':
            await actions.tag(documentId, automation.action.tagNames)
            break
          case 'classify':
            await actions.classify(documentId)
            break
          default:
            await this.automations.recordRun(
              automation.id,
              documentId,
              false,
              `Acción «${automation.action.type}» no soportada todavía`,
            )
            this.bus.emit('automation:run', { automationId: automation.id, documentId, ok: false })
            continue
        }
        await this.automations.recordRun(automation.id, documentId, true, 'ok')
        this.bus.emit('automation:run', { automationId: automation.id, documentId, ok: true })
      } catch (error) {
        await this.automations.recordRun(
          automation.id,
          documentId,
          false,
          error instanceof Error ? error.message : String(error),
        )
        this.bus.emit('automation:run', { automationId: automation.id, documentId, ok: false })
      }
    }
  }
}
