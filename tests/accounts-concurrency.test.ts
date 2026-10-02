import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountService } from '../src/accounts.js';
import { ConfigStore, createEmptyConfig, upsertAccount } from '../src/config.js';
import { MemoryCredentialStore } from '../src/keychain.js';

const dirs: string[] = [];
const cookie = 'userId=1; api-platform_serviceToken=test; api-platform_slh=test; api-platform_ph=test';

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

async function setup() {
  const dir = await mkdtemp(join(os.tmpdir(), 'mimo-concurrency-'));
  dirs.push(dir);
  const store = new ConfigStore(dir);
  await store.save(upsertAccount(createEmptyConfig(), {
    id: 'demo', name: 'Demo', label: 'before', userId: '1', isDefault: true,
    profileDir: store.profileDirFor('demo'), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }));
  const credentials = new MemoryCredentialStore();
  await credentials.setCookie('demo', cookie);
  return { store, credentials };
}

function usageResponse(url: string | URL | Request, used = 1): Response {
  const data = String(url).includes('/balance') ? {
    balance: used, cashBalance: used, giftBalance: 0, frozenBalance: 0, overdraftLimit: 0, remainingOverdraftLimit: 0
  } : String(url).includes('/detail') ? null : {
    monthUsage: { percent: used, items: [] },
    usage: { percent: used, items: [{ name: 'plan_total_token', used, limit: 100, percent: used }] }
  };
  return new Response(JSON.stringify({ code: 0, data }));
}

describe('concurrent account operations', () => {
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('keeps label changes and new key metadata across overlapping service instances', async () => {
    const { store, credentials } = await setup();
    const entered = gate();
    const blocked = gate();
    const original = credentials.setApiKey.bind(credentials);
    vi.spyOn(credentials, 'setApiKey').mockImplementation(async (id, key) => {
      entered.release();
      await blocked.wait;
      await original(id, key);
    });
    const service = new AccountService({ configStore: store, credentialStore: credentials });
    const other = new AccountService({ configStore: new ConfigStore(store.dataDir), credentialStore: credentials });
    const add = service.addApiKey({ accountId: 'demo', apiKey: 'synthetic-test-only' });
    await entered.wait;
    const rename = other.renameLabel('demo', 'after');
    // Give the old implementation time to save its newer label before the stale key snapshot.
    await new Promise((resolve) => setTimeout(resolve, 30));
    blocked.release();
    await Promise.all([add, rename]);
    const config = await service.load();
    expect(config.accounts[0]!.label).toBe('after');
    expect(config.apiKeys).toHaveLength(1);
  });

  it.each([false, true])('does not restore deleted accounts after a pending refresh (failure=%s)', async (fail) => {
    const { store, credentials } = await setup();
    const entered = gate();
    const blocked = gate();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      entered.release();
      await blocked.wait;
      if (fail) throw new Error('synthetic offline');
      return usageResponse(url);
    }) as typeof fetch;
    const service = new AccountService({ configStore: store, credentialStore: credentials, fetchImpl });
    const refresh = service.refreshAccount('demo');
    await entered.wait;
    await service.remove('demo');
    blocked.release();
    await refresh;
    const config = await service.load();
    expect(config.accounts).toEqual([]);
    expect(config.snapshots).toEqual({});
  });

  it('keeps label changes when a background refresh finishes', async () => {
    const { store, credentials } = await setup();
    const entered = gate();
    const blocked = gate();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      entered.release(); await blocked.wait;
      return usageResponse(url);
    }) as typeof fetch;
    const service = new AccountService({ configStore: store, credentialStore: credentials, fetchImpl });
    const refresh = service.refreshAccount('demo');
    await entered.wait;
    await service.renameLabel('demo', 'after');
    blocked.release();
    await refresh;
    const config = await service.load();
    expect(config.accounts[0]!.label).toBe('after');
    expect(config.snapshots.demo!.planUsage[0]!.used).toBe(1);
  });

  it.each([false, true])('discards an older refresh result after a newer refresh finishes (failure=%s)', async (fail) => {
    const { store, credentials } = await setup();
    const entered = gate();
    const blocked = gate();
    let first = true;
    const slowFetch = vi.fn(async (url: string | URL | Request) => {
      if (first) { first = false; entered.release(); await blocked.wait; }
      if (fail) throw new Error('synthetic stale failure');
      return usageResponse(url, 10);
    }) as typeof fetch;
    const slow = new AccountService({ configStore: store, credentialStore: credentials, fetchImpl: slowFetch });
    const fast = new AccountService({ configStore: new ConfigStore(store.dataDir), credentialStore: credentials,
      fetchImpl: (async (url) => usageResponse(url, 20)) as typeof fetch });
    const oldRefresh = slow.refreshAccount('demo');
    await entered.wait;
    await fast.refreshAccount('demo');
    blocked.release();
    await oldRefresh;
    const config = await store.load();
    expect(config.snapshots.demo!.planUsage[0]!.used).toBe(20);
    expect(config.snapshots.demo!.status).toBe('ok');
    expect(config.accounts[0]!.lastError).toBeUndefined();
  });

  it('invalidates a pending refresh when login credentials change', async () => {
    const { store, credentials } = await setup();
    const entered = gate();
    const blocked = gate();
    const service = new AccountService({ configStore: store, credentialStore: credentials,
      fetchImpl: (async (url) => { entered.release(); await blocked.wait; return usageResponse(url); }) as typeof fetch });
    const refresh = service.refreshAccount('demo');
    await entered.wait;
    await service.addOrUpdateFromCookie({ name: 'Demo', cookieHeader: cookie.replace('serviceToken=test', 'serviceToken=new'), validateUsage: false });
    blocked.release();
    await refresh;
    expect((await store.load()).snapshots.demo).toBeUndefined();
  });
});
