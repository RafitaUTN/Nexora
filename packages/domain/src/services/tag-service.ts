import type { NewTag, Tag, TagStats } from '../entities/tag'
import type { TagRepository } from '../ports/repositories'
import type { EventBus } from '../ports/event-bus'

/**
 * Casos de uso de etiquetas inteligentes.
 */
export class TagService {
  constructor(
    private readonly tags: TagRepository,
    private readonly bus: EventBus,
  ) {}

  async list(): Promise<Tag[]> {
    return this.tags.list()
  }

  async listWithStats(): Promise<TagStats[]> {
    return this.tags.listWithStats()
  }

  async create(input: NewTag): Promise<Tag> {
    const existing = await this.tags.findByName(input.name)
    if (existing) return existing
    const tag = await this.tags.create(input)
    return tag
  }

  async assign(tagId: number, documentId: number): Promise<void> {
    await this.tags.assign(tagId, documentId)
    this.bus.emit('notification', {
      level: 'info',
      title: 'Etiqueta asignada',
    })
  }

  async unassign(tagId: number, documentId: number): Promise<void> {
    await this.tags.unassign(tagId, documentId)
  }

  async tagsOf(documentId: number): Promise<Tag[]> {
    return this.tags.listByDocument(documentId)
  }

  async delete(id: number): Promise<void> {
    await this.tags.delete(id)
  }

  /** Crea etiquetas sugeridas por IA manteniendo el vocabulario existente. */
  async ensureSuggested(names: string[]): Promise<Tag[]> {
    const created: Tag[] = []
    for (const raw of names) {
      const name = raw.trim().slice(0, 60)
      if (!name) continue
      const existing = await this.tags.findByName(name)
      if (existing) {
        created.push(existing)
        continue
      }
      created.push(await this.tags.create({ name }))
    }
    return created
  }
}
