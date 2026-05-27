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
  remove: (accountId: string) => ipcRenderer.invoke('account:remove', accountId)
});
