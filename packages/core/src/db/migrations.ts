import type { SqliteDatabase } from './database'

export interface Migration {
  version: number
  name: string
  up: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'core_schema',
    up: `
      CREATE TABLE IF NOT EXISTS sources (
        id            INTEGER PRIMARY KEY,
        path          TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        kind          TEXT NOT NULL DEFAULT 'folder',
        scan_mode     TEXT NOT NULL DEFAULT 'recursive',
        enabled       INTEGER NOT NULL DEFAULT 1,
        last_scan_at  TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS documents (
        id                INTEGER PRIMARY KEY,
        source_id         INTEGER REFERENCES sources(id) ON DELETE SET NULL,
        path              TEXT NOT NULL,
        filename          TEXT NOT NULL,
        ext               TEXT NOT NULL,
        mime_type         TEXT,
        size_bytes        INTEGER NOT NULL DEFAULT 0,
        hash_sha256       TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'pending',
        title             TEXT,
        content_preview   TEXT,
        ocr_confidence    REAL,
        language          TEXT,
        version           INTEGER NOT NULL DEFAULT 1,
        is_duplicate_of   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
        file_mtime_ms     INTEGER,
        added_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at        TEXT,
        UNIQUE (source_id, path)
      );
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
      CREATE INDEX IF NOT EXISTS idx_documents_hash   ON documents(hash_sha256);
      CREATE INDEX IF NOT EXISTS idx_documents_ext    ON documents(ext);
      CREATE INDEX IF NOT EXISTS idx_documents_mtime  ON documents(file_mtime_ms);
      CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_id);

      CREATE TABLE IF NOT EXISTS document_contents (
        document_id    INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        content        TEXT NOT NULL,
        content_hash   TEXT NOT NULL,
        fts_indexed_at TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title, content,
        tokenize='porter unicode61'
      );
      CREATE TRIGGER IF NOT EXISTS documents_fts_ai AFTER INSERT ON document_contents BEGIN
        INSERT INTO documents_fts(rowid, title, content)
        VALUES (new.document_id,
                (SELECT title FROM documents WHERE id = new.document_id),
                new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS documents_fts_ad AFTER DELETE ON document_contents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content)
        VALUES('delete', old.document_id, old.content, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS documents_fts_au AFTER UPDATE ON document_contents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content)
        VALUES('delete', old.document_id, old.content, old.content);
        INSERT INTO documents_fts(rowid, title, content)
        VALUES (new.document_id,
                (SELECT title FROM documents WHERE id = new.document_id),
                new.content);
      END;

      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS secrets (
        id         INTEGER PRIMARY KEY,
        kind       TEXT NOT NULL UNIQUE,
        ciphertext BLOB NOT NULL,
        iv         BLOB NOT NULL,
        auth_tag   BLOB NOT NULL,
        salt       BLOB NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 2,
    name: 'tags_classification_entities',
    up: `
      CREATE TABLE IF NOT EXISTS tags (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        color       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS document_tags (
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (document_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tag_id);

      CREATE TABLE IF NOT EXISTS classifications (
        document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        category    TEXT NOT NULL,
        confidence  REAL NOT NULL,
        provider    TEXT NOT NULL,
        model       TEXT NOT NULL,
        cached      INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS entities (
        id          INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL,
        value       TEXT NOT NULL,
        confidence  REAL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_entities_doc   ON entities(document_id, kind);
      CREATE INDEX IF NOT EXISTS idx_entities_value ON entities(value);
    `,
  },
  {
    version: 3,
    name: 'ocr_queue_ai_cache_usage',
    up: `
      CREATE TABLE IF NOT EXISTS ocr_results (
        document_id    INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        language       TEXT NOT NULL,
        confidence     REAL NOT NULL,
        text           TEXT NOT NULL,
        engine_version TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ocr_queue (
        id             INTEGER PRIMARY KEY,
        document_id    INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
        priority       INTEGER NOT NULL DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'pending',
        attempts       INTEGER NOT NULL DEFAULT 0,
        next_retry_at  TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ocr_queue_status ON ocr_queue(status, priority);

      CREATE TABLE IF NOT EXISTS ai_cache (
        id           INTEGER PRIMARY KEY,
        request_hash TEXT NOT NULL UNIQUE,
        provider     TEXT NOT NULL,
        model        TEXT NOT NULL,
        response     TEXT NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at   TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_usage (
        id                INTEGER PRIMARY KEY,
        provider          TEXT NOT NULL,
        model             TEXT NOT NULL,
        task              TEXT NOT NULL,
        prompt_tokens     INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        est_cost_usd      REAL NOT NULL DEFAULT 0,
        latency_ms        INTEGER NOT NULL DEFAULT 0,
        cached            INTEGER NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
    `,
  },
  {
    version: 4,
    name: 'history_audit_versions_backups_automations_licenses',
    up: `
      CREATE TABLE IF NOT EXISTS document_versions (
        id          INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        version     INTEGER NOT NULL,
        path        TEXT NOT NULL,
        hash_sha256 TEXT NOT NULL,
        size_bytes  INTEGER NOT NULL,
        note        TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(document_id, version);

      CREATE TABLE IF NOT EXISTS history (
        id          INTEGER PRIMARY KEY,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        action      TEXT NOT NULL,
        detail      TEXT,
        actor       TEXT DEFAULT 'system',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_history_doc      ON history(document_id);
      CREATE INDEX IF NOT EXISTS idx_history_created  ON history(created_at);

      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY,
        actor       TEXT NOT NULL,
        action      TEXT NOT NULL,
        entity_type TEXT,
        entity_id   TEXT,
        detail      TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

      CREATE TABLE IF NOT EXISTS backups (
        id          INTEGER PRIMARY KEY,
        path        TEXT NOT NULL,
        size_bytes  INTEGER NOT NULL,
        sha256      TEXT NOT NULL,
        kind        TEXT NOT NULL DEFAULT 'manual',
        status      TEXT NOT NULL DEFAULT 'done',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS automations (
        id           INTEGER PRIMARY KEY,
        name         TEXT NOT NULL,
        enabled      INTEGER NOT NULL DEFAULT 1,
        trigger_type TEXT NOT NULL,
        action_type  TEXT NOT NULL,
        config       TEXT NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS automation_runs (
        id            INTEGER PRIMARY KEY,
        automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
        document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
        status        TEXT NOT NULL,
        detail        TEXT,
        ran_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS licenses (
        id           INTEGER PRIMARY KEY,
        tier         TEXT NOT NULL DEFAULT 'free',
        status       TEXT NOT NULL DEFAULT 'active',
        key_cipher   BLOB,
        iv           BLOB,
        auth_tag     BLOB,
        salt         BLOB,
        device_id    TEXT,
        activated_at TEXT,
        expires_at   TEXT,
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 5,
    name: 'users_sessions',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY,
        username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
        display_name  TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id           INTEGER PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash   TEXT NOT NULL UNIQUE,
        expires_at   TEXT NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `,
  },
  {
    version: 6,
    name: 'license_columns',
    up: `
      ALTER TABLE licenses ADD COLUMN key_sha256 TEXT;
      ALTER TABLE licenses ADD COLUMN signature TEXT;
      ALTER TABLE licenses ADD COLUMN max_devices INTEGER;
    `,
  },
  {
    version: 7,
    name: 'sync_outbox',
    up: `
      CREATE TABLE IF NOT EXISTS sync_outbox (
        entity       TEXT NOT NULL,
        entity_key   TEXT NOT NULL,
        op           TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        synced       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (entity, entity_key)
      );
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_unsynced ON sync_outbox(synced, updated_at_ms);

      CREATE TABLE IF NOT EXISTS sync_meta (
        entity    TEXT NOT NULL,
        device_id TEXT NOT NULL,
        local_id  TEXT NOT NULL,
        mapped_id INTEGER NOT NULL,
        PRIMARY KEY (entity, device_id, local_id)
      );

      CREATE TRIGGER IF NOT EXISTS sync_documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('document', CAST(new.id AS TEXT), 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('document', CAST(new.id AS TEXT), 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('document', CAST(old.id AS TEXT), 'delete',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;

      CREATE TRIGGER IF NOT EXISTS sync_contents_ai AFTER INSERT ON document_contents BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('document', CAST(new.document_id AS TEXT), 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_contents_au AFTER UPDATE ON document_contents BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('document', CAST(new.document_id AS TEXT), 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;

      CREATE TRIGGER IF NOT EXISTS sync_tags_ai AFTER INSERT ON tags BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('tag', CAST(new.id AS TEXT), 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_tags_au AFTER UPDATE ON tags BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('tag', CAST(new.id AS TEXT), 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_tags_ad AFTER DELETE ON tags BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('tag', CAST(old.id AS TEXT), 'delete',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;

      CREATE TRIGGER IF NOT EXISTS sync_assignments_ai AFTER INSERT ON document_tags BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('assignment', CAST(new.document_id AS TEXT) || ':' || CAST(new.tag_id AS TEXT), 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_assignments_ad AFTER DELETE ON document_tags BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('assignment', CAST(old.document_id AS TEXT) || ':' || CAST(old.tag_id AS TEXT), 'delete',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
    `,
  },
  {
    version: 8,
    name: 'shares',
    up: `
      CREATE TABLE IF NOT EXISTS shares (
        id           INTEGER PRIMARY KEY,
        uid          TEXT NOT NULL UNIQUE,
        owner_email  TEXT NOT NULL,
        member_email TEXT NOT NULL,
        role         TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor')),
        status       TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','revoked')),
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (owner_email, member_email)
      );
      CREATE INDEX IF NOT EXISTS idx_shares_owner  ON shares(owner_email);
      CREATE INDEX IF NOT EXISTS idx_shares_member ON shares(member_email);

      CREATE TRIGGER IF NOT EXISTS sync_shares_ai AFTER INSERT ON shares BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('share', new.uid, 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_shares_au AFTER UPDATE ON shares BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('share', new.uid, 'upsert',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_shares_ad AFTER DELETE ON shares BEGIN
        INSERT INTO sync_outbox (entity, entity_key, op, updated_at_ms, synced)
        VALUES ('share', old.uid, 'delete',
                CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), 0)
        ON CONFLICT(entity, entity_key) DO UPDATE SET
          op = excluded.op, updated_at_ms = excluded.updated_at_ms, synced = 0;
      END;
    `,
  },
  {
    version: 9,
    name: 'shared_documents',
    up: `
      ALTER TABLE documents ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_documents_shared ON documents(shared);
    `,
  },
  {
    version: 10,
    name: 'sync_last_payload',
    up: `
      -- Línea base del último payload subido por clave. Permite resolver
      -- conflictos por campos: al aplicar un cambio remoto se compara campo a
      -- campo contra esta línea base para saber qué campos tocó cada lado.
      CREATE TABLE IF NOT EXISTS sync_last_payload (
        entity      TEXT NOT NULL,
        entity_key  TEXT NOT NULL,
        payload     TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (entity, entity_key)
      );
    `,
  },
]

export function runMigrations(db: SqliteDatabase, list: Migration[] = migrations): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  )
  const pending = [...list].sort((a, b) => a.version - b.version)
  for (const migration of pending) {
    if (applied.has(migration.version)) continue
    db.transaction(() => {
      db.exec(migration.up)
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      )
    })
  }
}
