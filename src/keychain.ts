import { KEYCHAIN_SERVICE } from './constants.js';

export interface CredentialStore {
  getCookie(accountId: string): Promise<string | null>;
  setCookie(accountId: string, cookieHeader: string): Promise<void>;
  deleteCookie(accountId: string): Promise<void>;
  getApiKey(secretId: string): Promise<string | null>;
  setApiKey(secretId: string, apiKey: string): Promise<void>;
  deleteApiKey(secretId: string): Promise<void>;
}

export class KeychainCredentialStore implements CredentialStore {
  constructor(private readonly service = KEYCHAIN_SERVICE) {}

  async getCookie(accountId: string): Promise<string | null> {
    return this.getSecret(accountId);
  }

  async setCookie(accountId: string, cookieHeader: string): Promise<void> {
    await this.setSecret(accountId, cookieHeader);
  }

  async deleteCookie(accountId: string): Promise<void> {
    await this.deleteSecret(accountId);
  }

  async getApiKey(secretId: string): Promise<string | null> {
    return this.getSecret(apiKeyKeychainAccount(secretId));
  }

  async setApiKey(secretId: string, apiKey: string): Promise<void> {
    await this.setSecret(apiKeyKeychainAccount(secretId), apiKey);
  }

  async deleteApiKey(secretId: string): Promise<void> {
    await this.deleteSecret(apiKeyKeychainAccount(secretId));
  }

  private async getSecret(account: string): Promise<string | null> {
    const { Entry } = await import('@napi-rs/keyring');
    const entry = new Entry(this.service, account);
    try {
      return entry.getPassword() || null;
    } catch (error) {
      if (isMissingCredentialError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async setSecret(account: string, value: string): Promise<void> {
    const { Entry } = await import('@napi-rs/keyring');
    const entry = new Entry(this.service, account);
    entry.setPassword(value);
  }

  private async deleteSecret(account: string): Promise<void> {
    const { Entry } = await import('@napi-rs/keyring');
    const entry = new Entry(this.service, account);
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

  async getApiKey(secretId: string): Promise<string | null> {
    return this.values.get(apiKeyKeychainAccount(secretId)) ?? null;
  }

  async setApiKey(secretId: string, apiKey: string): Promise<void> {
    this.values.set(apiKeyKeychainAccount(secretId), apiKey);
  }

  async deleteApiKey(secretId: string): Promise<void> {
    this.values.delete(apiKeyKeychainAccount(secretId));
  }
}

function isMissingCredentialError(error: unknown): boolean {
  return error instanceof Error && /not found|no entry|missing/i.test(error.message);
}

function apiKeyKeychainAccount(secretId: string): string {
  return `api-key:${secretId}`;
}
