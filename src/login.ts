import { mkdir } from 'node:fs/promises';
import { PLATFORM_ORIGIN } from './constants.js';
import type { MimoCookieSet } from './types.js';
import {
  type BrowserCookie,
  cookieHeaderFromBrowserCookies,
  validateMimoCookieHeader
} from './utils/cookies.js';

export interface BrowserLoginOptions {
  profileDir: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onStatus?: (message: string) => void;
}

export async function waitForBrowserLogin(options: BrowserLoginOptions): Promise<MimoCookieSet> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  await mkdir(options.profileDir, { recursive: true, mode: 0o700 });

  const { chromium } = await import('playwright');
  options.onStatus?.('Opening Xiaomi MiMo login page...');
  const context = await launchPersistentContext(chromium, options.profileDir);

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(PLATFORM_ORIGIN, { waitUntil: 'domcontentloaded' });
    options.onStatus?.('Complete Xiaomi login in the browser window.');

    const deadline = Date.now() + timeoutMs;
    let lastError: Error | null = null;

    while (Date.now() < deadline) {
      const cookies = await context.cookies(PLATFORM_ORIGIN);
      try {
        return cookieHeaderFromBrowserCookies(cookies as BrowserCookie[]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      await delay(pollIntervalMs);
    }

    throw new Error(lastError ? `Timed out waiting for login: ${lastError.message}` : 'Timed out waiting for login');
  } finally {
    await context.close();
  }
}

export function validateManualCookie(cookieHeader: string): MimoCookieSet {
  return validateMimoCookieHeader(cookieHeader);
}

async function launchPersistentContext(
  chromium: Awaited<typeof import('playwright')>['chromium'],
  profileDir: string
) {
  const baseOptions = {
    headless: false,
    viewport: { width: 1200, height: 900 }
  };

  try {
    return await chromium.launchPersistentContext(profileDir, baseOptions);
  } catch (firstError) {
    try {
      return await chromium.launchPersistentContext(profileDir, {
        ...baseOptions,
        channel: 'chrome'
      });
    } catch {
      const message = firstError instanceof Error ? firstError.message : String(firstError);
      throw new Error(
        `Unable to launch Chromium for login. Run "pnpm exec playwright install chromium" or install Google Chrome. Original error: ${message}`
      );
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
