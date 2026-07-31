import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IpcChannel, IpcEvent } from '@documind/shared'
import type { DocuMindApi } from './preload-api'

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data
}

const api: DocuMindApi = {
  system: {
    info: () => invoke(IpcChannel.SystemInfo),
    ping: () => invoke(IpcChannel.SystemPing),
    selectFolder: () => invoke(IpcChannel.DialogSelectFolder),
    selectFile: () => invoke(IpcChannel.DialogSelectFile),
    importPaths: (paths) => invoke(IpcChannel.SystemImportPaths, paths),
  },

  files: {
    getPath: (file) => webUtils.getPathForFile(file),
  },

  documents: {
    list: (filter) => invoke(IpcChannel.DocumentsList, filter),
    get: (id) => invoke(IpcChannel.DocumentsGet, id),
    delete: (id) => invoke(IpcChannel.DocumentsDelete, id),
    stats: () => invoke(IpcChannel.DocumentsStats),
    history: (id) => invoke(IpcChannel.DocumentsHistory, id),
  },

  sources: {
    list: () => invoke(IpcChannel.SourcesList),
    add: (input) => invoke(IpcChannel.SourcesAdd, input),
    remove: (id) => invoke(IpcChannel.SourcesRemove, id),
    rescan: (id) => invoke(IpcChannel.SourcesRescan, id),
  },

  search: {
    query: (query, limit, filter) => invoke(IpcChannel.SearchQuery, { query, limit, filter }),
  },

  tags: {
    list: () => invoke(IpcChannel.TagsList),
    create: (input) => invoke(IpcChannel.TagsCreate, input),
    assign: (tagId, documentId) => invoke(IpcChannel.TagsAssign, { tagId, documentId }),
    remove: (tagId, documentId) => invoke(IpcChannel.TagsRemove, { tagId, documentId }),
    delete: (id) => invoke(IpcChannel.TagsDelete, id),
  },

  ai: {
    classify: (documentId) => invoke(IpcChannel.AiClassify, documentId),
    summarize: (documentId) => invoke(IpcChannel.AiSummarize, documentId),
    qa: (question) => invoke(IpcChannel.AiQa, question),
    usage: () => invoke(IpcChannel.AiUsage),
    health: () => invoke(IpcChannel.AiHealth),
    setApiKey: (provider, apiKey) => invoke(IpcChannel.AiSetApiKey, { provider, apiKey }),
    deleteApiKey: (provider) => invoke(IpcChannel.AiDeleteApiKey, { provider }),
    apiKeyStatus: (provider) => invoke(IpcChannel.AiApiKeyStatus, { provider }),
  },

  ocr: {
    health: () => invoke(IpcChannel.OcrHealth),
  },

  settings: {
    get: () => invoke(IpcChannel.SettingsGet),
    set: (patch) => invoke(IpcChannel.SettingsSet, patch),
  },

  backups: {
    create: () => invoke(IpcChannel.BackupsCreate),
    list: () => invoke(IpcChannel.BackupsList),
    restore: (name) => invoke(IpcChannel.BackupsRestore, name),
  },

  automations: {
    list: () => invoke(IpcChannel.AutomationsList),
    create: (input) => invoke(IpcChannel.AutomationsCreate, input),
    setEnabled: (id, enabled) => invoke(IpcChannel.AutomationsSetEnabled, { id, enabled }),
    remove: (id) => invoke(IpcChannel.AutomationsRemove, id),
  },

  audit: {
    list: (limit, cursor) => invoke(IpcChannel.AuditList, { limit, cursor }),
  },

  auth: {
    status: () => invoke(IpcChannel.AuthStatus),
    setup: (input) => invoke(IpcChannel.AuthSetup, input),
    register: (input) => invoke(IpcChannel.AuthRegister, input),
    login: (username, password) => invoke(IpcChannel.AuthLogin, { username, password }),
    logout: () => invoke(IpcChannel.AuthLogout),
    listUsers: () => invoke(IpcChannel.AuthListUsers),
    setRole: (userId, role) => invoke(IpcChannel.AuthSetRole, { userId, role }),
    changePassword: (currentPassword, newPassword) =>
      invoke(IpcChannel.AuthChangePassword, { currentPassword, newPassword }),
    deleteUser: (userId) => invoke(IpcChannel.AuthDeleteUser, userId),
  },

  updates: {
    check: () => invoke(IpcChannel.UpdatesCheck),
    install: () => invoke(IpcChannel.UpdatesInstall),
    state: () => invoke(IpcChannel.UpdatesState),
  },

  license: {
    status: () => invoke(IpcChannel.LicenseStatus),
    activate: (key) => invoke(IpcChannel.LicenseActivate, key),
    deactivate: () => invoke(IpcChannel.LicenseDeactivate),
  },

  sync: {
    status: () => invoke(IpcChannel.SyncStatus),
    setEnabled: (enabled) => invoke(IpcChannel.SyncSetEnabled, enabled),
    configure: (url, anonKey, email, password) =>
      invoke(IpcChannel.SyncConfigure, { url, anonKey, email, password }),
    signUp: (url, anonKey, email, password) =>
      invoke(IpcChannel.SyncSignUp, { url, anonKey, email, password }),
    signOut: () => invoke(IpcChannel.SyncSignOut),
    run: () => invoke(IpcChannel.SyncRun),
    ping: () => invoke(IpcChannel.SyncPing),
  },

  shares: {
    list: () => invoke(IpcChannel.SharesList),
    invite: (memberEmail, role) => invoke(IpcChannel.SharesInvite, { memberEmail, role }),
    accept: (uid) => invoke(IpcChannel.SharesAccept, uid),
    revoke: (uid) => invoke(IpcChannel.SharesRevoke, uid),
    setRole: (uid, role) => invoke(IpcChannel.SharesSetRole, { uid, role }),
    outgoing: () => invoke(IpcChannel.SharesOutgoing),
    incoming: () => invoke(IpcChannel.SharesIncoming),
  },

  /** Suscripción a eventos del proceso principal (devuelve unsubscribe). */
  on: <T>(channel: IpcEvent, callback: (payload: T) => void) => {
    const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

void IpcEvent
