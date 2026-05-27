import { BrowserWindow, ipcMain } from 'electron';
import { AccountService, createAccountId } from '../accounts.js';
import { ConfigStore } from '../config.js';
import { waitForElectronLogin } from './login-window.js';

export interface GuiApiResult<T> {
  ok: true;
  data: T;
}

export interface GuiApiError {
  ok: false;
  error: string;
}

export type GuiApiResponse<T> = GuiApiResult<T> | GuiApiError;

export function registerIpcHandlers(service: AccountService, getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('dashboard:load', async () => wrap(() => service.load()));
  ipcMain.handle('dashboard:refreshAll', async () => wrap(() => service.refreshAll()));

  ipcMain.handle('account:setDefault', async (_event, accountId: string) => wrap(() => service.setDefault(accountId)));
  ipcMain.handle('account:renameLabel', async (_event, accountId: string, label: string) =>
    wrap(() => service.renameLabel(accountId, label))
  );
  ipcMain.handle('account:remove', async (_event, accountId: string) => wrap(() => service.remove(accountId)));
  ipcMain.handle('account:addFromCookie', async (_event, input: { name: string; label?: string; cookieHeader: string }) =>
    wrap(() =>
      service.addOrUpdateFromCookie({
        name: input.name,
        label: input.label,
        cookieHeader: input.cookieHeader,
        validateUsage: true
      })
    )
  );
  ipcMain.handle('account:login', async (_event, input: { name?: string; label?: string } = {}) =>
    wrap(async () => {
      const requestedName = input.name?.trim();
      const config = await service.load();
      const existingByName = requestedName
        ? config.accounts.find((account) => account.name === requestedName)
        : undefined;
      const provisionalName = requestedName || 'mimo-account';
      const provisionalAccountId = existingByName?.id ?? createAccountId(provisionalName, config.accounts);
      const cookieSet = await waitForElectronLogin({
        accountId: provisionalAccountId,
        accountName: requestedName || 'New MiMo account',
        parent: getMainWindow() ?? undefined
      });
      const existingByUserId = config.accounts.find((account) => account.userId === cookieSet.userId);
      const existing = existingByName ?? existingByUserId;
      const accountId = existing?.id ?? provisionalAccountId;
      const accountName = existing?.name ?? requestedName ?? uniqueAccountName(`mimo-${cookieSet.userId}`, config.accounts);

      return service.addOrUpdateFromCookie({
        name: accountName,
        label: input.label,
        cookieHeader: cookieSet.cookieHeader,
        accountId,
        profileDir: existing?.profileDir ?? service.configStore.profileDirFor(accountId),
        validateUsage: true
      });
    })
  );
}

export function createGuiAccountService(dataDir?: string): AccountService {
  return new AccountService({
    configStore: new ConfigStore(dataDir)
  });
}

async function wrap<T>(fn: () => Promise<T>): Promise<GuiApiResponse<T>> {
  try {
    return {
      ok: true,
      data: await fn()
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function uniqueAccountName(baseName: string, accounts: { name: string }[]): string {
  let candidate = baseName;
  let suffix = 2;
  while (accounts.some((account) => account.name === candidate)) {
    candidate = `${baseName}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
