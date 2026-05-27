import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigStore, createEmptyConfig, upsertAccount } from '../src/config.js';

let tempDirs: string[] = [];

describe('ConfigStore', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs = [];
  });

  it('loads defaults when config does not exist', async () => {
    const dir = await tempDir();
    const store = new ConfigStore(dir);
    const config = await store.load();

    expect(config.accounts).toEqual([]);
    expect(config.settings.refreshIntervalSeconds).toBe(60);
  });

  it('saves and reloads config atomically', async () => {
    const dir = await tempDir();
    const store = new ConfigStore(dir);
    const now = '2026-05-27T00:00:00.000Z';
    const config = upsertAccount(createEmptyConfig(), {
      id: 'main',
      name: 'main',
      label: 'Work',
      userId: '1464563959',
      isDefault: true,
      profileDir: join(dir, 'profiles', 'main'),
      createdAt: now,
      updatedAt: now
    });

    await store.save(config);
    const reloaded = await store.load();

    expect(reloaded.accounts).toHaveLength(1);
    expect(reloaded.accounts[0]?.isDefault).toBe(true);
    expect(reloaded.settings.defaultAccountId).toBe('main');
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(os.tmpdir(), 'mimo-watcher-test-'));
  tempDirs.push(dir);
  return dir;
}
