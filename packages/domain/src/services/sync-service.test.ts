import { describe, expect, it } from 'vitest'
import type {
  SyncChange,
  SyncSettings,
  SyncStatus,
} from '../entities/sync'
import type { SyncLocalStore, SyncRemoteStore } from '../ports/sync'
import { SyncService, keyOf } from './sync-service'

class FakeLocalStore implements SyncLocalStore {
  pendingChanges: SyncChange[] = []
  settings: SyncSettings = {
    enabled: true,
    url: 'https://db.example.supabase.co',
    anonKey: 'anon-123',
    email: 'admin@documind.local',
    lastPullMs: 0,
  }
  deviceId = 'device-1'
  syncedKeys: string[] = []
  applied: SyncChange[] = []
  skippedKeys: string[] = []
  lastPullMs = 0

  async pending(): Promise<SyncChange[]> {
    return this.pendingChanges
  }
  async markSynced(changes: SyncChange[]): Promise<void> {
    this.syncedKeys.push(...changes.map(keyOf))
    this.pendingChanges = []
  }
  async applyRemote(changes: SyncChange[]): Promise<{ applied: number; skipped: number }> {
    for (const change of changes) {
      if (this.skippedKeys.includes(keyOf(change))) continue
      this.applied.push(change)
    }
    return { applied: this.applied.length, skipped: this.skippedKeys.length }
  }
  async getSettings(): Promise<SyncSettings> {
    return this.settings
  }
  async saveSettings(settings: SyncSettings): Promise<void> {
    this.settings = settings
    this.lastPullMs = settings.lastPullMs
  }
  async getDeviceId(): Promise<string> {
    return this.deviceId
  }
  async status(): Promise<Omit<SyncStatus, 'url' | 'configured' | 'anonKeySet'>> {
    return {
      enabled: this.settings.enabled,
      authenticated: this.settings.email.length > 0,
      email: this.settings.email,
      deviceId: this.deviceId,
      pending: this.pendingChanges.length,
      lastPullMs: this.lastPullMs,
    }
  }
}

class FakeRemoteStore implements SyncRemoteStore {
  pushed: SyncChange[] = []
  pulledSince = 0
  remoteChanges: SyncChange[] = []
  pinged = 0

  async push(changes: SyncChange[]): Promise<void> {
    this.pushed.push(...changes)
  }
  async pull(sinceMs: number): Promise<SyncChange[]> {
    this.pulledSince = sinceMs
    return this.remoteChanges
  }
  async ping(): Promise<void> {
    this.pinged++
  }
}

function change(partial: Partial<SyncChange> & { entityKey: string }): SyncChange {
  return {
    entity: 'document',
    op: 'upsert',
    updatedAtMs: 1,
    deviceId: 'device-2',
    ...partial,
  } as SyncChange
}

describe('SyncService', () => {
  describe('status', () => {
    it('refleja configuración, dispositivo y pendientes', async () => {
      const local = new FakeLocalStore()
      local.pendingChanges = [change({ entityKey: '10' })]
      const service = new SyncService(local, new FakeRemoteStore())
      const status = await service.status()
      expect(status).toMatchObject({
        enabled: true,
        configured: true,
        url: 'https://db.example.supabase.co',
        deviceId: 'device-1',
        pending: 1,
      })
    })

    it('marca no configurado cuando falta la URL o la anon key', async () => {
      const local = new FakeLocalStore()
      local.settings.url = ''
      const service = new SyncService(local, new FakeRemoteStore())
      expect((await service.status()).configured).toBe(false)

      local.settings.url = 'https://db.example.supabase.co'
      local.settings.anonKey = ''
      expect((await service.status()).configured).toBe(false)
      expect((await service.status()).anonKeySet).toBe(false)
    })
  })

  describe('setEnabled / configure', () => {
    it('persiste el estado y devuelve el estado resultante', async () => {
      const local = new FakeLocalStore()
      const service = new SyncService(local, new FakeRemoteStore())
      const disabled = await service.setEnabled(false)
      expect(disabled.enabled).toBe(false)
      expect(local.settings.enabled).toBe(false)
      const reconfigured = await service.configure('https://new.example.supabase.co', 'anon-456')
      expect(reconfigured.url).toBe('https://new.example.supabase.co')
      expect(local.settings.url).toBe('https://new.example.supabase.co')
      expect(local.settings.anonKey).toBe('anon-456')
    })
  })

  describe('sync', () => {
    it('sube pendientes, los marca y trae/aplica cambios remotos', async () => {
      const local = new FakeLocalStore()
      local.pendingChanges = [change({ entityKey: '10', updatedAtMs: 100 })]
      const remote = new FakeRemoteStore()
      remote.remoteChanges = [change({ entityKey: '20', updatedAtMs: 200 })]
      const service = new SyncService(local, remote)

      const result = await service.sync()

      expect(remote.pushed).toHaveLength(1)
      expect(local.syncedKeys).toEqual(['document:10'])
      expect(remote.pulledSince).toBe(0)
      expect(local.applied.map(keyOf)).toEqual(['document:20'])
      expect(result).toEqual({ pushed: 1, pulled: 1, applied: 1, skipped: 0 })
      expect(local.lastPullMs).toBeGreaterThan(0)
    })

    it('usa lastPullMs previo como marca de corte', async () => {
      const local = new FakeLocalStore()
      local.settings.lastPullMs = 5000
      const remote = new FakeRemoteStore()
      remote.remoteChanges = [change({ entityKey: '9' })]
      const service = new SyncService(local, remote)
      await service.sync()
      expect(remote.pulledSince).toBe(5000)
    })

    it('no sube ni marca nada cuando no hay pendientes', async () => {
      const local = new FakeLocalStore()
      const remote = new FakeRemoteStore()
      const service = new SyncService(local, remote)
      const result = await service.sync()
      expect(remote.pushed).toHaveLength(0)
      expect(result.pushed).toBe(0)
      expect(result.pulled).toBe(0)
    })

    it('lanza error si la sincronización está deshabilitada', async () => {
      const local = new FakeLocalStore()
      local.settings.enabled = false
      const service = new SyncService(local, new FakeRemoteStore())
      await expect(service.sync()).rejects.toThrow(/ERR_SYNC_DISABLED/)
    })

    it('lanza error si no hay URL configurada', async () => {
      const local = new FakeLocalStore()
      local.settings.url = ''
      const service = new SyncService(local, new FakeRemoteStore())
      await expect(service.sync()).rejects.toThrow(/ERR_SYNC_NOT_CONFIGURED/)
    })

    it('contabiliza cambios remotos descartados por LWW local', async () => {
      const local = new FakeLocalStore()
      local.skippedKeys = ['document:30']
      const remote = new FakeRemoteStore()
      remote.remoteChanges = [change({ entityKey: '30' }), change({ entityKey: '31' })]
      const service = new SyncService(local, remote)
      const result = await service.sync()
      expect(result).toEqual({ pushed: 0, pulled: 2, applied: 1, skipped: 1 })
      expect(local.applied.map(keyOf)).toEqual(['document:31'])
    })
  })

  describe('ping', () => {
    it('comprueba la conectividad remota si está configurada y habilitada', async () => {
      const remote = new FakeRemoteStore()
      const service = new SyncService(new FakeLocalStore(), remote)
      await service.ping()
      expect(remote.pinged).toBe(1)
    })

    it('lanza si está deshabilitada', async () => {
      const local = new FakeLocalStore()
      local.settings.enabled = false
      const service = new SyncService(local, new FakeRemoteStore())
      await expect(service.ping()).rejects.toThrow(/ERR_SYNC_DISABLED/)
    })

    it('lanza si no está configurada', async () => {
      const local = new FakeLocalStore()
      local.settings.url = ''
      const service = new SyncService(local, new FakeRemoteStore())
      await expect(service.ping()).rejects.toThrow(/ERR_SYNC_NOT_CONFIGURED/)
    })
  })
})

describe('keyOf', () => {
  it('compone entidad y clave para evitar colisiones entre IDs', () => {
    expect(keyOf({ entity: 'tag', entityKey: '5' })).toBe('tag:5')
    expect(keyOf({ entity: 'document', entityKey: '5' })).toBe('document:5')
  })
})
