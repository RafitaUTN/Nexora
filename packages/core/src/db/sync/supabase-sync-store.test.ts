import { describe, expect, it } from 'vitest'
import { SupabaseSyncStore } from './supabase-sync-store'
import type { SyncChange } from '@documind/domain'

function mockFetch(handler: (url: string, init: RequestInit) => unknown): {
  store: SupabaseSyncStore
  calls: { url: string; init: RequestInit }[]
} {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init: init ?? {} })
    const body = handler(u, init ?? {})
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      json: async () => body,
    } as Response
  }) as typeof fetch
  return {
    store: new SupabaseSyncStore({ url: 'https://x.supabase.co', anonKey: 'anon-k', deviceId: 'device-1', fetchImpl }),
    calls,
  }
}

describe('SupabaseSyncStore', () => {
  it('ping consulta sync_meta con autenticación', async () => {
    const { store, calls } = mockFetch(() => [])
    await store.ping()
    expect(calls[0]?.url).toContain('/rest/v1/sync_meta?select=device_id&limit=1')
    expect(calls[0]?.init.headers).toMatchObject({ apikey: 'anon-k' })
  })

  it('push agrupa por entidad y hace UPSERT con on_conflict', async () => {
    const { store, calls } = mockFetch(() => [])
    const document: SyncChange = {
      entity: 'document',
      entityKey: '10',
      op: 'upsert',
      updatedAtMs: 100,
      deviceId: 'device-1',
      document: {
        localId: 10,
        filename: 'a.pdf',
        ext: 'pdf',
        mimeType: null,
        sizeBytes: 1,
        hashSha256: 'h',
        status: 'indexed',
        title: 'A',
        contentPreview: null,
        ocrConfidence: null,
        language: null,
        version: 1,
        addedAt: null,
        content: 'texto',
        contentHash: 'ch',
      },
    }
    const tag: SyncChange = {
      entity: 'tag',
      entityKey: '3',
      op: 'upsert',
      updatedAtMs: 100,
      deviceId: 'device-1',
      tag: { localId: 3, name: 't', color: '#f00', createdAt: null },
    }
    await store.push([document, tag])
    expect(calls).toHaveLength(2)
    const docs = calls.find((c) => c.url.includes('sync_documents'))
    const tags = calls.find((c) => c.url.includes('sync_tags'))
    expect(docs?.url).toContain('on_conflict=device_id,local_id')
    expect(docs?.init.headers).toMatchObject({ Prefer: 'resolution=merge-duplicates' })
    const docBody = JSON.parse(String(docs?.init.body)) as Record<string, unknown>[]
    expect(docBody[0]).toMatchObject({ device_id: 'device-1', local_id: 10, title: 'A', content: 'texto' })
    const tagBody = JSON.parse(String(tags?.init.body)) as Record<string, unknown>[]
    expect(tagBody[0]).toMatchObject({ local_id: 3, name: 't' })
  })

  it('push de tombstones envía fila mínima con deleted_at_ms', async () => {
    const { store, calls } = mockFetch(() => [])
    const change: SyncChange = {
      entity: 'document',
      entityKey: '9',
      op: 'delete',
      updatedAtMs: 500,
      deviceId: 'device-1',
    }
    await store.push([change])
    const doc = calls.find((c) => c.url.includes('sync_documents'))
    const body = JSON.parse(String(doc?.init.body)) as Record<string, unknown>[]
    expect(body[0]).toEqual({
      device_id: 'device-1',
      updated_at_ms: 500,
      local_id: 9,
      deleted_at_ms: 500,
      user_id: null,
    })
  })

  it('push de asignaciones usa document_id/tag_id', async () => {
    const { store, calls } = mockFetch(() => [])
    const change: SyncChange = {
      entity: 'assignment',
      entityKey: '4:7',
      op: 'upsert',
      updatedAtMs: 200,
      deviceId: 'device-1',
      assignment: { documentId: 4, tagId: 7 },
    }
    await store.push([change])
    const call = calls.find((c) => c.url.includes('sync_document_tags'))
    expect(call?.url).toContain('on_conflict=device_id,document_id,tag_id')
    const body = JSON.parse(String(call?.init.body)) as Record<string, unknown>[]
    expect(body[0]).toMatchObject({ document_id: 4, tag_id: 7 })
  })

  it('push de tombstone de asignación mapea document_id/tag_id', async () => {
    const { store, calls } = mockFetch(() => [])
    const change: SyncChange = {
      entity: 'assignment',
      entityKey: '4:7',
      op: 'delete',
      updatedAtMs: 300,
      deviceId: 'device-1',
    }
    await store.push([change])
    const call = calls.find((c) => c.url.includes('sync_document_tags'))
    const body = JSON.parse(String(call?.init.body)) as Record<string, unknown>[]
    expect(body[0]).toEqual({
      device_id: 'device-1',
      user_id: null,
      updated_at_ms: 300,
      document_id: 4,
      tag_id: 7,
      deleted_at_ms: 300,
    })
  })

  it('pull trae cambios posteriores a sinceMs excluyendo el propio dispositivo', async () => {
    const remoteDoc = {
      device_id: 'device-2',
      local_id: 22,
      updated_at_ms: 300,
      deleted_at_ms: null,
      filename: 'r.pdf',
      ext: 'pdf',
      mime_type: null,
      size_bytes: 5,
      hash_sha256: 'hr',
      status: 'indexed',
      title: 'R',
      content_preview: null,
      ocr_confidence: null,
      language: null,
      version: 1,
      added_at: null,
      content: 'rc',
      content_hash: 'ch',
    }
    const remoteTag = {
      device_id: 'device-2',
      local_id: 8,
      updated_at_ms: 350,
      deleted_at_ms: null,
      name: 'tag-remoto',
      color: '#0f0',
      created_at: null,
    }
    const remoteAssignment = {
      device_id: 'device-2',
      document_id: 22,
      tag_id: 8,
      updated_at_ms: 400,
      deleted_at_ms: null,
    }
    const { store, calls } = mockFetch((url) => {
      if (url.includes('sync_documents')) return [remoteDoc]
      if (url.includes('sync_tags')) return [remoteTag]
      if (url.includes('sync_shares')) return []
      return [remoteAssignment]
    })
    const changes = await store.pull(100)
    expect(calls.length).toBe(4)
    expect(calls[0]?.url).toContain('updated_at_ms=gt.100')
    expect(calls[0]?.url).toContain('device_id=neq.device-1')
    expect(changes).toHaveLength(3)
    const doc = changes.find((c) => c.entity === 'document')
    expect(doc).toMatchObject({
      entityKey: '22',
      op: 'upsert',
      updatedAtMs: 300,
      deviceId: 'device-2',
    })
    expect(doc?.document?.filename).toBe('r.pdf')
    const tag = changes.find((c) => c.entity === 'tag')
    expect(tag?.tag?.name).toBe('tag-remoto')
    const assignment = changes.find((c) => c.entity === 'assignment')
    expect(assignment?.assignment).toEqual({ documentId: 22, tagId: 8 })
  })

  it('convierte filas con deleted_at_ms en tombstones', async () => {
    const { store } = mockFetch((url) => {
      if (url.includes('sync_documents')) return []
      if (url.includes('sync_document_tags')) return []
      if (url.includes('sync_shares')) return []
      return [
        { device_id: 'device-2', local_id: 5, updated_at_ms: 700, deleted_at_ms: 700, name: 'x', color: null, created_at: null },
      ]
    })
    const changes = await store.pull(0)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ entity: 'tag', op: 'delete', updatedAtMs: 700 })
    expect(changes[0]?.tag).toBeUndefined()
  })

  it('push de share usa uid canónico y no sobreescribe user_id', async () => {
    const { store, calls } = mockFetch(() => [])
    const change: SyncChange = {
      entity: 'share',
      entityKey: 'uid-abc-123',
      op: 'upsert',
      updatedAtMs: 600,
      deviceId: 'device-1',
      share: {
        localId: 1,
        uid: 'uid-abc-123',
        ownerEmail: 'owner@example.com',
        memberEmail: 'member@example.com',
        role: 'viewer',
        status: 'invited',
        createdAt: null,
      },
    }
    await store.push([change])
    const call = calls.find((c) => c.url.includes('sync_shares'))
    expect(call?.url).toContain('on_conflict=uid')
    const body = JSON.parse(String(call?.init.body)) as Record<string, unknown>[]
    expect(body[0]).toEqual({
      device_id: 'device-1',
      updated_at_ms: 600,
      uid: 'uid-abc-123',
      owner_email: 'owner@example.com',
      member_email: 'member@example.com',
      role: 'viewer',
      status: 'invited',
      created_at: null,
      deleted_at_ms: null,
    })
    expect(body[0]).not.toHaveProperty('user_id')
  })

  it('pull convierte filas de sync_shares en cambios share', async () => {
    const { store } = mockFetch((url) => {
      if (url.includes('sync_documents')) return []
      if (url.includes('sync_tags')) return []
      if (url.includes('sync_document_tags')) return []
      return [
        {
          device_id: 'device-2',
          uid: 'uid-xyz',
          updated_at_ms: 900,
          deleted_at_ms: null,
          owner_email: 'owner@example.com',
          member_email: 'me@example.com',
          role: 'viewer',
          status: 'invited',
          created_at: '2026-07-31',
        },
      ]
    })
    const changes = await store.pull(0)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      entity: 'share',
      entityKey: 'uid-xyz',
      op: 'upsert',
      updatedAtMs: 900,
      deviceId: 'device-2',
    })
    expect(changes[0]?.share).toMatchObject({
      ownerEmail: 'owner@example.com',
      memberEmail: 'me@example.com',
      status: 'invited',
    })
  })

  it('lanza ERR_SYNC_REMOTE cuando Supabase responde con error', async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid api key',
    })) as unknown as typeof fetch
    const store = new SupabaseSyncStore({
      url: 'https://x.supabase.co',
      anonKey: 'bad',
      deviceId: 'd',
      fetchImpl,
    })
    await expect(store.ping()).rejects.toThrow(/ERR_SYNC_REMOTE/)
  })
})
