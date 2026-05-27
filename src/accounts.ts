import { randomUUID } from 'node:crypto';
import type { Account, ApiKeyRef, AppConfig, UsageSnapshot, UsageStatus } from './types.js';
import { ConfigStore, upsertAccount } from './config.js';
import type { CredentialStore } from './keychain.js';
import { KeychainCredentialStore } from './keychain.js';
import { fetchUsageSnapshot, MimoUsageError } from './usage.js';
import { validateManualCookie, waitForBrowserLogin } from './login.js';
import { maskApiKey, normalizeApiKey } from './utils/api-keys.js';
import { summarizeQuota } from './utils/status.js';

export interface AccountServiceOptions {
  configStore?: ConfigStore;
  credentialStore?: CredentialStore;
  fetchImpl?: typeof fetch;
}

export interface AddAccountInput {
  name: string;
  label?: string;
  cookieHeader: string;
  validateUsage?: boolean;
  accountId?: string;
  profileDir?: string;
}

export interface AddApiKeyInput {
  accountId: string;
  label?: string;
  apiKey: string;
}

export class AccountService {
  readonly configStore: ConfigStore;
  private readonly credentialStore: CredentialStore;
  private readonly fetchImpl?: typeof fetch;

  constructor(options: AccountServiceOptions = {}) {
    this.configStore = options.configStore ?? new ConfigStore();
    this.credentialStore = options.credentialStore ?? new KeychainCredentialStore();
    this.fetchImpl = options.fetchImpl;
  }

  async load(): Promise<AppConfig> {
    return this.configStore.load();
  }

  async addOrUpdateFromCookie(input: AddAccountInput): Promise<AppConfig> {
    const parsed = validateManualCookie(input.cookieHeader);
    let config = await this.configStore.load();
    const existing = config.accounts.find((account) => account.name === input.name);
    const now = new Date().toISOString();
    const accountId = existing?.id ?? input.accountId ?? createAccountId(input.name, config.accounts);
    const account: Account = {
      id: accountId,
      name: input.name.trim(),
      label: input.label?.trim() || existing?.label,
      userId: parsed.userId,
      isDefault: existing?.isDefault ?? config.accounts.length === 0,
      profileDir: existing?.profileDir ?? input.profileDir ?? this.configStore.profileDirFor(accountId),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastRefreshAt: existing?.lastRefreshAt,
      lastError: undefined
    };

    await this.credentialStore.setCookie(account.id, parsed.cookieHeader);
    config = upsertAccount(config, account);
    config = await this.configStore.save(config);

    if (input.validateUsage ?? true) {
      await this.refreshAccount(account.id);
      config = await this.configStore.load();
    }

    return config;
  }

  async addOrUpdateFromBrowserLogin(input: {
    name: string;
    label?: string;
    onStatus?: (message: string) => void;
  }): Promise<AppConfig> {
    const config = await this.configStore.load();
    const existing = config.accounts.find((account) => account.name === input.name);
    const accountId = existing?.id ?? createAccountId(input.name, config.accounts);
    const parsed = await waitForBrowserLogin({
      profileDir: existing?.profileDir ?? this.configStore.profileDirFor(accountId),
      onStatus: input.onStatus
    });

    return this.addOrUpdateFromCookie({
      name: input.name,
      label: input.label,
      cookieHeader: parsed.cookieHeader,
      validateUsage: true,
      accountId,
      profileDir: existing?.profileDir ?? this.configStore.profileDirFor(accountId)
    });
  }

  async refreshAll(): Promise<AppConfig> {
    let config = await this.configStore.load();
    for (const account of config.accounts) {
      await this.refreshAccount(account.id);
    }
    config = await this.configStore.load();
    return config;
  }

  async refreshAccount(accountId: string): Promise<UsageSnapshot | null> {
    const config = await this.configStore.load();
    const account = config.accounts.find((candidate) => candidate.id === accountId);
    if (!account) {
      throw new Error(`Unknown account: ${accountId}`);
    }

    const cookieHeader = await this.credentialStore.getCookie(accountId);
    if (!cookieHeader) {
      await this.markRefreshError(accountId, 'login required', 'No cookie found in Keychain');
      return null;
    }

    try {
      const snapshot = await fetchUsageSnapshot({
        accountId,
        cookieHeader,
        settings: config.settings,
        fetchImpl: this.fetchImpl
      });
      await this.saveSnapshot(accountId, snapshot);
      return snapshot;
    } catch (error) {
      const status = usageStatusForError(error);
      const message = error instanceof Error ? error.message : String(error);
      await this.markRefreshError(accountId, status, message);
      return null;
    }
  }

  async setDefault(accountId: string): Promise<AppConfig> {
    const config = await this.configStore.load();
    if (!config.accounts.some((account) => account.id === accountId)) {
      throw new Error(`Unknown account: ${accountId}`);
    }
    return this.configStore.save({
      ...config,
      settings: {
        ...config.settings,
        defaultAccountId: accountId
      }
    });
  }

  async renameLabel(accountId: string, label: string): Promise<AppConfig> {
    const config = await this.configStore.load();
    const accounts = config.accounts.map((account) =>
      account.id === accountId
        ? { ...account, label: label.trim() || undefined, updatedAt: new Date().toISOString() }
        : account
    );
    return this.configStore.save({ ...config, accounts });
  }

  async addApiKey(input: AddApiKeyInput): Promise<AppConfig> {
    const config = await this.configStore.load();
    assertAccountExists(config, input.accountId);
    const apiKey = normalizeApiKey(input.apiKey);
    if (!apiKey) {
      throw new Error('API key is required.');
    }

    const now = new Date().toISOString();
    const apiKeyRef: ApiKeyRef = {
      id: randomUUID(),
      accountId: input.accountId,
      label: input.label?.trim() || undefined,
      maskedKey: maskApiKey(apiKey),
      createdAt: now,
      updatedAt: now
    };

    await this.credentialStore.setApiKey(apiKeyRef.id, apiKey);
    return this.configStore.save({
      ...config,
      apiKeys: [...config.apiKeys, apiKeyRef]
    });
  }

  async copyApiKey(accountId: string, apiKeyId: string): Promise<{ apiKey: string; config: AppConfig }> {
    const config = await this.configStore.load();
    const apiKeyRef = findApiKey(config, accountId, apiKeyId);
    const apiKey = await this.credentialStore.getApiKey(apiKeyRef.id);
    if (!apiKey) {
      throw new Error('API key secret was not found in Keychain.');
    }

    const now = new Date().toISOString();
    const next = await this.configStore.save({
      ...config,
      apiKeys: config.apiKeys.map((candidate) =>
        candidate.id === apiKeyId && candidate.accountId === accountId
          ? { ...candidate, lastCopiedAt: now, updatedAt: now }
          : candidate
      )
    });

    return { apiKey, config: next };
  }

  async removeApiKey(accountId: string, apiKeyId: string): Promise<AppConfig> {
    const config = await this.configStore.load();
    const apiKeyRef = findApiKey(config, accountId, apiKeyId);
    await this.credentialStore.deleteApiKey(apiKeyRef.id);
    return this.configStore.save({
      ...config,
      apiKeys: config.apiKeys.filter((candidate) => !(candidate.accountId === accountId && candidate.id === apiKeyId))
    });
  }

  async remove(accountId: string): Promise<AppConfig> {
    const config = await this.configStore.load();
    await this.credentialStore.deleteCookie(accountId);
    await Promise.all(
      config.apiKeys
        .filter((apiKey) => apiKey.accountId === accountId)
        .map((apiKey) => this.credentialStore.deleteApiKey(apiKey.id))
    );
    const accounts = config.accounts.filter((account) => account.id !== accountId);
    const apiKeys = config.apiKeys.filter((apiKey) => apiKey.accountId !== accountId);
    const snapshots = { ...config.snapshots };
    delete snapshots[accountId];
    const defaultAccountId =
      config.settings.defaultAccountId === accountId ? accounts[0]?.id : config.settings.defaultAccountId;
    return this.configStore.save({
      ...config,
      accounts,
      apiKeys,
      snapshots,
      settings: {
        ...config.settings,
        defaultAccountId
      }
    });
  }

  private async saveSnapshot(accountId: string, snapshot: UsageSnapshot): Promise<void> {
    const config = await this.configStore.load();
    const now = new Date().toISOString();
    const accounts = config.accounts.map((account) =>
      account.id === accountId
        ? { ...account, lastRefreshAt: now, lastError: undefined, updatedAt: now }
        : account
    );
    await this.configStore.save({
      ...config,
      accounts,
      snapshots: {
        ...config.snapshots,
        [accountId]: snapshot
      }
    });
  }

  private async markRefreshError(
    accountId: string,
    status: Extract<UsageStatus, 'stale' | 'login required'>,
    message: string
  ): Promise<void> {
    const config = await this.configStore.load();
    const now = new Date().toISOString();
    const accounts = config.accounts.map((account) =>
      account.id === accountId
        ? { ...account, lastRefreshAt: now, lastError: message, updatedAt: now }
        : account
    );
    const previous = config.snapshots[accountId];
    const snapshot: UsageSnapshot = previous
      ? { ...previous, status }
      : {
          accountId,
          fetchedAt: now,
          monthUsage: [],
          planUsage: [],
          quotaSummary: summarizeQuota([], []),
          overallPercent: 0,
          status
        };
    await this.configStore.save({
      ...config,
      accounts,
      snapshots: {
        ...config.snapshots,
        [accountId]: snapshot
      }
    });
  }
}

export function createAccountId(name: string, existing: Account[] = []): string {
  const base = slugify(name) || 'account';
  let candidate = `${base}-${randomUUID().slice(0, 8)}`;
  while (existing.some((account) => account.id === candidate)) {
    candidate = `${base}-${randomUUID().slice(0, 8)}`;
  }
  return candidate;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function usageStatusForError(error: unknown): Extract<UsageStatus, 'stale' | 'login required'> {
  if (error instanceof MimoUsageError && error.kind === 'auth') {
    return 'login required';
  }
  return 'stale';
}

function assertAccountExists(config: AppConfig, accountId: string): void {
  if (!config.accounts.some((account) => account.id === accountId)) {
    throw new Error(`Unknown account: ${accountId}`);
  }
}

function findApiKey(config: AppConfig, accountId: string, apiKeyId: string): ApiKeyRef {
  assertAccountExists(config, accountId);
  const apiKey = config.apiKeys.find((candidate) => candidate.accountId === accountId && candidate.id === apiKeyId);
  if (!apiKey) {
    throw new Error(`Unknown API key: ${apiKeyId}`);
  }
  return apiKey;
}
