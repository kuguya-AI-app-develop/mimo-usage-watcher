import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import {
  DEFAULT_CONFIG_DIR_NAME,
  DEFAULT_CRITICAL_PERCENT,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  DEFAULT_WARN_PERCENT
} from './constants.js';
import type { Account, AppConfig, Settings, UsageSnapshot } from './types.js';
import { summarizeQuota } from './utils/status.js';

const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string().optional(),
  userId: z.string(),
  isDefault: z.boolean().default(false),
  profileDir: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastRefreshAt: z.string().optional(),
  refreshRequestId: z.string().optional(),
  lastError: z.string().optional()
});

const ApiKeyRefSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  label: z.string().optional(),
  maskedKey: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastCopiedAt: z.string().optional()
});

const TokenBucketSchema = z.object({
  name: z.string(),
  used: z.number(),
  limit: z.number(),
  percent: z.number(),
  remaining: z.number()
});

const QuotaSummarySchema = z.object({
  source: z.enum(['token_plan', 'api_key', 'mixed', 'unknown']),
  used: z.number(),
  limit: z.number(),
  percent: z.number(),
  remaining: z.number()
});

const BalanceSnapshotSchema = z.object({
  balance: z.number(),
  cashBalance: z.number(),
  giftBalance: z.number(),
  frozenBalance: z.number(),
  overdraftLimit: z.number(),
  remainingOverdraftLimit: z.number(),
  currency: z.string().optional()
});

const TokenPlanDetailSchema = z.object({
  planCode: z.string().optional(),
  planName: z.string().optional(),
  currentPeriodEnd: z.string().optional(),
  expired: z.boolean().optional(),
  hasAutoRenewSubscribed: z.boolean().optional(),
  enableAutoRenew: z.boolean().optional()
});

const UsageSnapshotSchema = z
  .object({
    accountId: z.string(),
    fetchedAt: z.string(),
    monthUsage: z.array(TokenBucketSchema),
    planUsage: z.array(TokenBucketSchema),
    balance: BalanceSnapshotSchema.optional(),
    tokenPlan: TokenPlanDetailSchema.optional(),
    quotaSummary: QuotaSummarySchema.optional(),
    overallPercent: z.number(),
    status: z.enum(['ok', 'warn', 'critical', 'stale', 'login required', 'unknown'])
  })
  .transform((snapshot) => ({
    ...snapshot,
    quotaSummary: snapshot.quotaSummary ?? summarizeQuota(snapshot.monthUsage, snapshot.planUsage, snapshot.balance)
  }));

const SettingsSchema = z.object({
  refreshIntervalSeconds: z.number().int().positive().default(DEFAULT_REFRESH_INTERVAL_SECONDS),
  warnPercent: z.number().min(0).max(100).default(DEFAULT_WARN_PERCENT),
  criticalPercent: z.number().min(0).max(100).default(DEFAULT_CRITICAL_PERCENT),
  defaultAccountId: z.string().optional()
});

const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  accounts: z.array(AccountSchema).default([]),
  apiKeys: z.array(ApiKeyRefSchema).default([]),
  settings: SettingsSchema.default(createDefaultSettings),
  snapshots: z.record(z.string(), UsageSnapshotSchema).default({})
});

// Share the queue across store/service instances using the same configuration file.
const writeQueues = new Map<string, Promise<void>>();

export class ConfigStore {
  readonly dataDir: string;
  readonly configPath: string;

  constructor(dataDir = getDefaultDataDir()) {
    this.dataDir = resolve(dataDir);
    this.configPath = join(this.dataDir, 'config.json');
  }

  async load(): Promise<AppConfig> {
    try {
      const raw = await readFile(this.configPath, 'utf8');
      return normalizeConfig(ConfigSchema.parse(JSON.parse(raw)), this.dataDir);
    } catch (error) {
      if (isNotFoundError(error)) {
        return createEmptyConfig();
      }
      throw error;
    }
  }

  async save(config: AppConfig): Promise<AppConfig> {
    return this.withWriteLock(() => this.writeConfig(config));
  }

  async update(mutator: (config: AppConfig) => AppConfig | Promise<AppConfig>): Promise<AppConfig> {
    return this.withWriteLock(async () => this.writeConfig(await mutator(await this.load())));
  }

  private async writeConfig(config: AppConfig): Promise<AppConfig> {
    const normalized = normalizeConfig(config, this.dataDir);
    const tempPath = `${this.configPath}.${process.pid}.${randomUUID()}.tmp`;
    const tempFile = await open(tempPath, 'wx', 0o600);
    try {
      await tempFile.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      await tempFile.close();
      await rename(tempPath, this.configPath);
      return normalized;
    } finally {
      await tempFile.close();
      await unlink(tempPath).catch((error: unknown) => { if (!isNotFoundError(error)) throw error; });
    }
  }

  private async withWriteLock<T>(action: () => Promise<T>): Promise<T> {
    const previous = writeQueues.get(this.configPath) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => { release = resolve; });
    writeQueues.set(this.configPath, tail);
    await previous;
    try {
      await mkdir(dirname(this.configPath), { recursive: true, mode: 0o700 });
      const lockPath = `${this.configPath}.lock`;
      // An exclusive lock file also coordinates GUI, TUI and other processes.
      // Never steal an existing lock: a slow owner could still be committing.
      let lockFile;
      for (let attempt = 0; !lockFile; attempt += 1) {
        try {
          lockFile = await open(lockPath, 'wx', 0o600);
        } catch (error) {
          if (!hasErrorCode(error, 'EEXIST')) throw error;
          if (attempt >= 100) {
            throw new Error(`Configuration is locked: ${lockPath}. Close other watcher processes; if a previous process crashed, remove this lock only after all watcher processes have exited.`);
          }
          await delay(100);
        }
      }
      try {
        await lockFile.writeFile(`${JSON.stringify({ pid: process.pid })}\n`, 'utf8');
        return await action();
      } finally {
        await lockFile.close();
        await unlink(lockPath);
      }
    } finally {
      release();
      if (writeQueues.get(this.configPath) === tail) writeQueues.delete(this.configPath);
    }
  }

  profileDirFor(accountId: string): string {
    return join(this.dataDir, 'profiles', accountId);
  }
}

export function getDefaultDataDir(): string {
  return process.env.MIMO_WATCHER_DATA_DIR || join(os.homedir(), DEFAULT_CONFIG_DIR_NAME);
}

export function createEmptyConfig(): AppConfig {
  return {
    version: 1,
    accounts: [],
    apiKeys: [],
    settings: createDefaultSettings(),
    snapshots: {}
  };
}

export function createDefaultSettings(): Settings {
  return {
    refreshIntervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
    warnPercent: DEFAULT_WARN_PERCENT,
    criticalPercent: DEFAULT_CRITICAL_PERCENT
  };
}

export function normalizeConfig(config: AppConfig, dataDir = getDefaultDataDir()): AppConfig {
  const settings = {
    ...createDefaultSettings(),
    ...config.settings
  };

  if (
    settings.defaultAccountId &&
    !config.accounts.some((account) => account.id === settings.defaultAccountId)
  ) {
    settings.defaultAccountId = undefined;
  }

  if (!settings.defaultAccountId && config.accounts.length > 0) {
    settings.defaultAccountId = config.accounts[0].id;
  }

  const accounts = config.accounts.map((account) => ({
    ...account,
    profileDir: account.profileDir || join(dataDir, 'profiles', account.id),
    isDefault: account.id === settings.defaultAccountId
  }));
  const accountIds = new Set(accounts.map((account) => account.id));
  const apiKeys = (config.apiKeys || []).filter((apiKey) => accountIds.has(apiKey.accountId));

  const snapshots: Record<string, UsageSnapshot> = {};
  for (const [accountId, snapshot] of Object.entries(config.snapshots || {})) {
    if (accounts.some((account) => account.id === accountId)) {
      snapshots[accountId] = snapshot;
    }
  }

  return {
    version: 1,
    accounts,
    apiKeys,
    settings,
    snapshots
  };
}

export function upsertAccount(config: AppConfig, account: Account): AppConfig {
  const index = config.accounts.findIndex((candidate) => candidate.id === account.id);
  const accounts = [...config.accounts];
  if (index >= 0) {
    accounts[index] = account;
  } else {
    accounts.push(account);
  }

  return normalizeConfig({
    ...config,
    accounts,
    settings: {
      ...config.settings,
      defaultAccountId: config.settings.defaultAccountId || account.id
    }
  });
}

function isNotFoundError(error: unknown): boolean {
  return hasErrorCode(error, 'ENOENT');
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === code
  );
}
