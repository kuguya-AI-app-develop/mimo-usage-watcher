import { KEYCHAIN_SERVICE } from './constants.js';

export interface CredentialStore {
  getCookie(accountId: string): Promise<string | null>;
  setCookie(accountId: string, cookieHeader: string): Promise<void>;
  deleteCookie(accountId: string): Promise<void>;
}

export class KeychainCredentialStore implements CredentialStore {
  constructor(private readonly service = KEYCHAIN_SERVICE) {}

  async getCookie(accountId: string): Promise<string | null> {
    const { Entry } = await import('@napi-rs/keyring');
    const entry = new Entry(this.service, accountId);
    try {
      return entry.getPassword() || null;
    } catch (error) {
      if (isMissingCredentialError(error)) {
        return null;
      }
      throw error;
    }
  }

  async setCookie(accountId: string, cookieHeader: string): Promise<void> {
    const { Entry } = await import('@napi-rs/keyring');
    const entry = new Entry(this.service, accountId);
    entry.setPassword(cookieHeader);
  }

  async deleteCookie(accountId: string): Promise<void> {
    const { Entry } = await import('@napi-rs/keyring');
    const entry = new Entry(this.service, accountId);
    try {
      entry.deletePassword();
    } catch (error) {
      if (!isMissingCredentialError(error)) {
        throw error;
      }
    }
  }
}

export class MemoryCredentialStore implements CredentialStore {
  private readonly values = new Map<string, string>();

  async getCookie(accountId: string): Promise<string | null> {
    return this.values.get(accountId) ?? null;
  }

  async setCookie(accountId: string, cookieHeader: string): Promise<void> {
    this.values.set(accountId, cookieHeader);
  }

  async deleteCookie(accountId: string): Promise<void> {
    this.values.delete(accountId);
  }
}

function isMissingCredentialError(error: unknown): boolean {
  return error instanceof Error && /not found|no entry|missing/i.test(error.message);
}
