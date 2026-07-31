/**
 * Allowlist de canales IPC. Cada canal debe registrarse aquí para que el
 * proceso principal lo sirva. Cualquier canal no registrado se rechaza.
 */
export const IpcChannel = {
  // System
  SystemInfo: 'system:info',
  SystemPing: 'system:ping',
  SystemImportPaths: 'system:importPaths',

  // Dialog (selección de carpetas/archivos)
  DialogSelectFolder: 'dialog:selectFolder',
  DialogSelectFile: 'dialog:selectFile',

  // Documents
  DocumentsList: 'documents:list',
  DocumentsGet: 'documents:get',
  DocumentsDelete: 'documents:delete',
  DocumentsStats: 'documents:stats',
  DocumentsHistory: 'documents:history',

  // Sources (carpetas escaneadas)
  SourcesList: 'sources:list',
  SourcesAdd: 'sources:add',
  SourcesRemove: 'sources:remove',
  SourcesRescan: 'sources:rescan',

  // Search
  SearchQuery: 'search:query',

  // Tags
  TagsList: 'tags:list',
  TagsAssign: 'tags:assign',
  TagsRemove: 'tags:remove',
  TagsCreate: 'tags:create',
  TagsDelete: 'tags:delete',

  // AI
  AiClassify: 'ai:classify',
  AiSummarize: 'ai:summarize',
  AiQa: 'ai:qa',
  AiUsage: 'ai:usage',
  AiHealth: 'ai:health',
  AiSetApiKey: 'ai:setApiKey',
  AiDeleteApiKey: 'ai:deleteApiKey',
  AiApiKeyStatus: 'ai:apiKeyStatus',
  AiResolveModel: 'ai:resolveModel',

  // OCR
  OcrHealth: 'ocr:health',
  OcrLanguagesList: 'ocr:languages:list',
  OcrLanguageInstall: 'ocr:language:install',
  OcrLanguageRemove: 'ocr:language:remove',
  OcrLanguageCheckUpdates: 'ocr:language:checkUpdates',

  // Settings
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',

  // Backups
  BackupsCreate: 'backups:create',
  BackupsList: 'backups:list',
  BackupsRestore: 'backups:restore',

  // Automations
  AutomationsList: 'automations:list',
  AutomationsCreate: 'automations:create',
  AutomationsSetEnabled: 'automations:setEnabled',
  AutomationsRemove: 'automations:remove',

  // Audit
  AuditList: 'audit:list',

  // Auth (usuarios y sesión)
  AuthStatus: 'auth:status',
  AuthSetup: 'auth:setup',
  AuthRegister: 'auth:register',
  AuthLogin: 'auth:login',
  AuthLogout: 'auth:logout',
  AuthListUsers: 'auth:listUsers',
  AuthSetRole: 'auth:setRole',
  AuthChangePassword: 'auth:changePassword',
  AuthDeleteUser: 'auth:deleteUser',

  // Updates
  UpdatesCheck: 'updates:check',
  UpdatesDownload: 'updates:download',
  UpdatesInstall: 'updates:install',
  UpdatesState: 'updates:state',

  // License
  LicenseStatus: 'license:status',
  LicenseActivate: 'license:activate',
  LicenseDeactivate: 'license:deactivate',

  // Sync (sincronización con Supabase/Postgres)
  SyncStatus: 'sync:status',
  SyncSetEnabled: 'sync:setEnabled',
  SyncConfigure: 'sync:configure',
  SyncSignUp: 'sync:signUp',
  SyncSignOut: 'sync:signOut',
  SyncRun: 'sync:run',
  SyncPing: 'sync:ping',

  // Shares (compartición multiusuario de la biblioteca)
  SharesList: 'shares:list',
  SharesInvite: 'shares:invite',
  SharesAccept: 'shares:accept',
  SharesRevoke: 'shares:revoke',
  SharesSetRole: 'shares:setRole',
  SharesOutgoing: 'shares:outgoing',
  SharesIncoming: 'shares:incoming',
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/**
 * Canales de eventos (solo envío: main -> renderer).
 */
export const IpcEvent = {
  EventDocumentIndexed: 'event:document:indexed',
  EventDocumentStatus: 'event:document:status',
  EventIndexProgress: 'event:index:progress',
  EventOcrProgress: 'event:ocr:progress',
  EventOcrLanguageProgress: 'event:ocr:language:progress',
  EventAiProgress: 'event:ai:progress',
  EventNotification: 'event:notification',
  EventUpdateStatus: 'event:update:status',
  EventAutomationRun: 'event:automation:run',
  EventGlobalSearch: 'event:globalSearch',
  EventSyncStatus: 'event:sync:status',
  EventSharesChanged: 'event:shares:changed',
} as const

export type IpcEvent = (typeof IpcEvent)[keyof typeof IpcEvent]
