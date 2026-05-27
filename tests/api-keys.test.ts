import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountService } from '../src/accounts.js';
import { ConfigStore, createEmptyConfig, upsertAccount } from '../src/config.js';
import { MemoryCredentialStore } from '../src/keychain.js';
import { maskApiKey } from '../src/utils/api-keys.js';

let tempDirs: string[] = [];

describe('API key storage', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs = [];
  });

  it('masks API keys without exposing the full value', () => {
    expect(maskApiKey('mimo_sk_1234567890abcdef')).toBe('mimo_sk_...cdef');
    expect(maskApiKey('abcd')).toBe('a...');
  });

  it('stores only metadata in config and keeps the secret in credential storage', async () => {
    const dir = await tempDir();
    const credentialStore = new MemoryCredentialStore();
    const service = new AccountService({
      configStore: new ConfigStore(dir),
      credentialStore
    });
    await seedAccount(service.configStore, dir);

    const config = await service.addApiKey({
      accountId: 'main',
      label: 'Coding key',
      apiKey: 'mimo_sk_1234567890abcdef'
    });

    expect(config.apiKeys).toHaveLength(1);
    expect(config.apiKeys[0]).toMatchObject({
      accountId: 'main',
      label: 'Coding key',
      maskedKey: 'mimo_sk_...cdef'
    });
    expect(JSON.stringify(config)).not.toContain('1234567890abcdef');

    const copied = await service.copyApiKey('main', config.apiKeys[0]!.id);
    expect(copied.apiKey).toBe('mimo_sk_1234567890abcdef');
    expect(copied.config.apiKeys[0]?.lastCopiedAt).toBeDefined();
  });

  it('removes API key secrets when metadata is deleted', async () => {
    const dir = await tempDir();
    const credentialStore = new MemoryCredentialStore();
    const service = new AccountService({
      configStore: new ConfigStore(dir),
      credentialStore
    });
    await seedAccount(service.configStore, dir);
    const config = await service.addApiKey({
      accountId: 'main',
      apiKey: 'mimo_sk_to_delete'
    });
    const apiKeyId = config.apiKeys[0]!.id;

    const next = await service.removeApiKey('main', apiKeyId);

    expect(next.apiKeys).toEqual([]);
    await expect(service.copyApiKey('main', apiKeyId)).rejects.toThrow(/Unknown API key/);
  });
});

async function seedAccount(store: ConfigStore, dir: string): Promise<void> {
  const now = '2026-05-27T00:00:00.000Z';
  await store.save(
    upsertAccount(createEmptyConfig(), {
      id: 'main',
      name: 'main',
      userId: '1464563959',
      isDefault: true,
      profileDir: join(dir, 'profiles', 'main'),
      createdAt: now,
      updatedAt: now
    })
  );
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(os.tmpdir(), 'mimo-api-key-test-'));
  tempDirs.push(dir);
  return dir;
}
