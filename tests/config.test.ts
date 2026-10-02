import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(config.apiKeys).toEqual([]);
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

  it('saves concurrent configurations when all calls occur in the same millisecond', async () => {
    const dir = await tempDir();
    const store = new ConfigStore(dir);
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => store.save(createEmptyConfig())));
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect((await store.load()).version).toBe(1);
  });

  it('releases its transaction lock after a failed mutation', async () => {
    const dir = await tempDir();
    const store = new ConfigStore(dir);
    await store.save(createEmptyConfig());
    await expect(store.update(() => { throw new Error('synthetic failed mutation'); }))
      .rejects.toThrow('synthetic failed mutation');
    await store.update((config) => ({ ...config, settings: { ...config.settings, refreshIntervalSeconds: 90 } }));
    expect((await store.load()).settings.refreshIntervalSeconds).toBe(90);
    expect(await readdir(dir)).toEqual(['config.json']);
  });

  it('cleans up only its temporary file when committing fails', async () => {
    const dir = await tempDir();
    const store = new ConfigStore(dir);
    // Renaming a file over a directory must fail after the temporary file is created.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(store.configPath);
    await expect(store.save(createEmptyConfig())).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['config.json']);
    await rm(store.configPath, { recursive: true });
    await store.save(createEmptyConfig());
    expect((await store.load()).version).toBe(1);
  });

  it('serializes full read/modify/write transactions across independent processes', async () => {
    const dir = await tempDir();
    const store = new ConfigStore(dir);
    await store.save(createEmptyConfig());
    const configModule = new URL('../src/config.ts', import.meta.url).href;
    const source = `
      import { ConfigStore } from ${JSON.stringify(configModule)};
      const store = new ConfigStore(process.env.MIMO_TEST_DATA_DIR);
      await store.update(async (config) => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return { ...config, settings: { ...config.settings,
          refreshIntervalSeconds: config.settings.refreshIntervalSeconds + 1 } };
      });
    `;
    const run = promisify(execFile);
    await Promise.all(Array.from({ length: 3 }, () => run(process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', source],
      { env: { ...process.env, MIMO_TEST_DATA_DIR: dir } }
    )));
    expect((await store.load()).settings.refreshIntervalSeconds).toBe(63);
    expect(await readdir(dir)).toEqual(['config.json']);
  });

  it('hydrates quota summary for older saved snapshots', async () => {
    const dir = await tempDir();
    const store = new ConfigStore(dir);
    const now = '2026-05-27T00:00:00.000Z';
    await writeFile(
      store.configPath,
      `${JSON.stringify({
        version: 1,
        accounts: [
          {
            id: 'main',
            name: 'main',
            userId: '1464563959',
            isDefault: true,
            profileDir: join(dir, 'profiles', 'main'),
            createdAt: now,
            updatedAt: now
          }
        ],
        settings: {
          refreshIntervalSeconds: 60,
          warnPercent: 80,
          criticalPercent: 95,
          defaultAccountId: 'main'
        },
        snapshots: {
          main: {
            accountId: 'main',
            fetchedAt: now,
            monthUsage: [{ name: 'month_total_token', used: 10, limit: 100, percent: 10, remaining: 90 }],
            planUsage: [{ name: 'plan_total_token', used: 20, limit: 100, percent: 20, remaining: 80 }],
            overallPercent: 20,
            status: 'ok'
          }
        }
      })}\n`
    );

    const config = await store.load();

    expect(config.snapshots.main?.quotaSummary).toMatchObject({
      source: 'token_plan',
      used: 20,
      remaining: 80
    });
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(os.tmpdir(), 'mimo-watcher-test-'));
  tempDirs.push(dir);
  return dir;
}
