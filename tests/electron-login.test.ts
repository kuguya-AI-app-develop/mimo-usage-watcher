import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  windows: [] as { destroyed: boolean; close: ReturnType<typeof vi.fn> }[],
  loadURL: vi.fn(),
  cookies: vi.fn(),
  onBeforeSendHeaders: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: class {
    destroyed = false;
    close = vi.fn(() => { this.destroyed = true; });
    constructor() { fake.windows.push(this); }
    once() { return this; }
    loadURL = fake.loadURL;
    isDestroyed() { return this.destroyed; }
  },
  session: {
    fromPartition: () => ({
      webRequest: { onBeforeSendHeaders: fake.onBeforeSendHeaders },
      cookies: { get: fake.cookies }
    })
  }
}));

import { waitForElectronLogin } from '../src/electron/login-window.js';

const options = { accountId: 'test-only', accountName: 'Test', timeoutMs: 10, pollIntervalMs: 1 };
const validCookies = [
  { name: 'userId', value: '1' },
  { name: 'api-platform_serviceToken', value: 'synthetic-token' },
  { name: 'api-platform_slh', value: 'synthetic-slh' },
  { name: 'api-platform_ph', value: 'synthetic-ph' }
];

describe('Electron login window lifecycle', () => {
  beforeEach(() => {
    fake.windows.length = 0;
    fake.loadURL.mockReset().mockResolvedValue(undefined);
    fake.cookies.mockReset().mockResolvedValue([]);
  });

  afterEach(() => vi.useRealTimers());

  it('closes the popup when initial navigation fails and keeps the original error', async () => {
    const error = new Error('synthetic navigation failure');
    fake.loadURL.mockRejectedValue(error);
    await expect(waitForElectronLogin(options)).rejects.toBe(error);
    expect(fake.windows[0]!.close).toHaveBeenCalledOnce();
  });

  it('closes the popup when a status callback throws', async () => {
    await expect(waitForElectronLogin({ ...options, onStatus: () => { throw new Error('status failed'); } }))
      .rejects.toThrow('status failed');
    expect(fake.windows[0]!.close).toHaveBeenCalledOnce();
  });

  it('does not close an already destroyed window again', async () => {
    fake.loadURL.mockImplementation(async () => { fake.windows[0]!.destroyed = true; });
    await expect(waitForElectronLogin(options)).rejects.toThrow('Login window was closed');
    expect(fake.windows[0]!.close).not.toHaveBeenCalled();
  });

  it('closes the popup on timeout', async () => {
    vi.useFakeTimers();
    const login = expect(waitForElectronLogin(options)).rejects.toThrow('Timed out waiting for login');
    await vi.advanceTimersByTimeAsync(11);
    await login;
    expect(fake.windows[0]!.close).toHaveBeenCalledOnce();
  });

  it('closes the popup after success and allows a clean retry after failed navigation', async () => {
    fake.loadURL.mockRejectedValueOnce(new Error('offline'));
    await expect(waitForElectronLogin(options)).rejects.toThrow('offline');
    fake.cookies.mockResolvedValue(validCookies);
    await expect(waitForElectronLogin(options)).resolves.toMatchObject({ userId: '1' });
    expect(fake.windows).toHaveLength(2);
    for (const window of fake.windows) expect(window.close).toHaveBeenCalledOnce();
  });
});
