import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mimo', {
  load: () => ipcRenderer.invoke('dashboard:load'),
  refreshAll: () => ipcRenderer.invoke('dashboard:refreshAll'),
  openExternalLogin: () => ipcRenderer.invoke('auth:openExternalLogin'),
  login: (input?: { name?: string; label?: string }) => ipcRenderer.invoke('account:login', input),
  addFromCookie: (input: { name: string; label?: string; cookieHeader: string }) =>
    ipcRenderer.invoke('account:addFromCookie', input),
  setDefault: (accountId: string) => ipcRenderer.invoke('account:setDefault', accountId),
  renameLabel: (accountId: string, label: string) => ipcRenderer.invoke('account:renameLabel', accountId, label),
  remove: (accountId: string) => ipcRenderer.invoke('account:remove', accountId),
  addApiKey: (input: { accountId: string; label?: string; apiKey: string }) => ipcRenderer.invoke('apiKey:add', input),
  copyApiKey: (accountId: string, apiKeyId: string) => ipcRenderer.invoke('apiKey:copy', accountId, apiKeyId),
  removeApiKey: (accountId: string, apiKeyId: string) => ipcRenderer.invoke('apiKey:remove', accountId, apiKeyId)
});
