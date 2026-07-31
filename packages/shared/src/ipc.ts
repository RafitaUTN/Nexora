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
  AiUsage: 'ai:usage',
  AiHealth: 'ai:health',
  AiSetApiKey: 'ai:setApiKey',
  AiDeleteApiKey: 'ai:deleteApiKey',
  AiApiKeyStatus: 'ai:apiKeyStatus',

  // OCR
  OcrHealth: 'ocr:health',

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

  // Updates
  UpdatesCheck: 'updates:check',
  UpdatesInstall: 'updates:install',
  UpdatesState: 'updates:state',
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
  EventAiProgress: 'event:ai:progress',
  EventNotification: 'event:notification',
  EventUpdateStatus: 'event:update:status',
  EventAutomationRun: 'event:automation:run',
} as const

export type IpcEvent = (typeof IpcEvent)[keyof typeof IpcEvent]
