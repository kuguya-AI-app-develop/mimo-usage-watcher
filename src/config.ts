import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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
  lastError: z.string().optional()
});

const TokenBucketSchema = z.object({
  name: z.string(),
  used: z.number(),
  limit: z.number(),
  percent: z.number(),
  remaining: z.number()
});

const UsageSnapshotSchema = z.object({
  accountId: z.string(),
  fetchedAt: z.string(),
  monthUsage: z.array(TokenBucketSchema),
  planUsage: z.array(TokenBucketSchema),
  overallPercent: z.number(),
  status: z.enum(['ok', 'warn', 'critical', 'stale', 'login required', 'unknown'])
});

const SettingsSchema = z.object({
  refreshIntervalSeconds: z.number().int().positive().default(DEFAULT_REFRESH_INTERVAL_SECONDS),
  warnPercent: z.number().min(0).max(100).default(DEFAULT_WARN_PERCENT),
  criticalPercent: z.number().min(0).max(100).default(DEFAULT_CRITICAL_PERCENT),
  defaultAccountId: z.string().optional()
});

const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  accounts: z.array(AccountSchema).default([]),
  settings: SettingsSchema.default(createDefaultSettings),
  snapshots: z.record(z.string(), UsageSnapshotSchema).default({})
});

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
    const normalized = normalizeConfig(config, this.dataDir);
    await mkdir(dirname(this.configPath), { recursive: true, mode: 0o700 });
    const tempPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    await rename(tempPath, this.configPath);
    return normalized;
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

  const snapshots: Record<string, UsageSnapshot> = {};
  for (const [accountId, snapshot] of Object.entries(config.snapshots || {})) {
    if (accounts.some((account) => account.id === accountId)) {
      snapshots[accountId] = snapshot;
    }
  }

  return {
    version: 1,
    accounts,
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
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
  );
}
