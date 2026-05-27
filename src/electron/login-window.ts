import { BrowserWindow, type BrowserWindowConstructorOptions, type Session, session } from 'electron';
import { LOGIN_ENTRY_URL, PLATFORM_ORIGIN } from '../constants.js';
import type { MimoCookieSet } from '../types.js';
import {
  type BrowserCookie,
  cookieValuesFromBrowserCookies,
  parseCookieHeader,
  validateMimoCookieValues
} from '../utils/cookies.js';

const activeLoginWindows = new Set<BrowserWindow>();

export interface ElectronLoginOptions {
  accountId: string;
  accountName: string;
  parent?: BrowserWindow;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onStatus?: (message: string) => void;
}

export async function waitForElectronLogin(options: ElectronLoginOptions): Promise<MimoCookieSet> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? 1200;
  const loginSession = session.fromPartition(loginPartition(options.accountId), {
    cache: true
  });
  const capturedPlatformCookies: Record<string, string> = {};
  capturePlatformRequestCookies(loginSession, capturedPlatformCookies);
  const loginWindow = createLoginWindow(options, loginSession);
  activeLoginWindows.add(loginWindow);
  loginWindow.once('closed', () => {
    activeLoginWindows.delete(loginWindow);
  });

  options.onStatus?.('Opening Xiaomi MiMo login window...');
  await loginWindow.loadURL(LOGIN_ENTRY_URL);
  options.onStatus?.('Complete Xiaomi login in the popup window.');

  try {
    const deadline = Date.now() + timeoutMs;
    let lastError: Error | null = null;

    while (Date.now() < deadline) {
      if (loginWindow.isDestroyed()) {
        throw new Error('Login window was closed before login completed');
      }

      const cookies = await loginSession.cookies.get({ url: PLATFORM_ORIGIN });
      try {
        return buildCookieSet(capturedPlatformCookies, cookies as BrowserCookie[]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      await delay(pollIntervalMs);
    }

    throw new Error(lastError ? `Timed out waiting for login: ${lastError.message}` : 'Timed out waiting for login');
  } finally {
    if (!loginWindow.isDestroyed()) {
      loginWindow.close();
    }
    activeLoginWindows.delete(loginWindow);
  }
}

export function loginPartition(accountId: string): string {
  return `persist:mimo-${accountId}`;
}

function createLoginWindow(options: ElectronLoginOptions, loginSession: Session): BrowserWindow {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1100,
    height: 820,
    title: `Login Xiaomi MiMo - ${options.accountName}`,
    parent: options.parent,
    modal: false,
    show: true,
    webPreferences: {
      session: loginSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  };

  return new BrowserWindow(windowOptions);
}

function capturePlatformRequestCookies(loginSession: Session, target: Record<string, string>): void {
  loginSession.webRequest.onBeforeSendHeaders({ urls: [`${PLATFORM_ORIGIN}/*`] }, (details, callback) => {
    const cookieHeader = readHeader(details.requestHeaders, 'cookie');
    if (cookieHeader) {
      Object.assign(target, parseCookieHeader(cookieHeader));
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

function buildCookieSet(capturedValues: Record<string, string>, cookies: BrowserCookie[]): MimoCookieSet {
  return validateMimoCookieValues({
    ...capturedValues,
    ...cookieValuesFromBrowserCookies(cookies)
  });
}

function readHeader(headers: Record<string, string | string[]>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = entry?.[1];
  if (Array.isArray(value)) {
    return value.join('; ');
  }
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
