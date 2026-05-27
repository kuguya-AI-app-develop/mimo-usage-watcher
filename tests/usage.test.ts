import { describe, expect, it, vi } from 'vitest';
import { fetchUsageSnapshot, MimoUsageError } from '../src/usage.js';

const okPayload = {
  code: 0,
  message: '',
  data: {
    monthUsage: {
      percent: 10,
      items: [{ name: 'month_total_token', used: 10, limit: 100, percent: 10 }]
    },
    usage: {
      percent: 20,
      items: [
        { name: 'plan_total_token', used: 20, limit: 100, percent: 20 },
        { name: 'compensation_total_token', used: 0, limit: 0, percent: 0 }
      ]
    }
  }
};

const apiKeyUsagePayload = {
  code: 0,
  message: '',
  data: {
    monthUsage: {
      percent: 0,
      items: [{ name: 'month_total_token', used: 0, limit: 0, percent: 0 }]
    },
    usage: {
      percent: 0,
      items: [{ name: 'compensation_total_token', used: 0, limit: 0, percent: 0 }]
    }
  }
};

const balancePayload = {
  code: 0,
  message: '',
  data: {
    balance: '12.5',
    cashBalance: 10,
    giftBalance: 2.5,
    frozenBalance: 1,
    overdraftLimit: 100,
    remainingOverdraftLimit: 80,
    currency: 'CNY'
  }
};

describe('fetchUsageSnapshot', () => {
  it('parses usage and balance API responses', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const body = String(url).includes('/balance') ? balancePayload : okPayload;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const snapshot = await fetchUsageSnapshot({
      accountId: 'main',
      cookieHeader: 'userId=1',
      settings: { warnPercent: 80, criticalPercent: 95 },
      fetchImpl
    });

    expect(snapshot.accountId).toBe('main');
    expect(snapshot.monthUsage[0]?.remaining).toBe(90);
    expect(snapshot.planUsage[0]?.name).toBe('plan_total_token');
    expect(snapshot.quotaSummary).toMatchObject({
      source: 'token_plan',
      used: 20,
      limit: 100,
      remaining: 80
    });
    expect(snapshot.balance).toMatchObject({
      balance: 12.5,
      cashBalance: 10,
      giftBalance: 2.5,
      remainingOverdraftLimit: 80
    });
    expect(snapshot.status).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/tokenPlan/usage'), expect.any(Object));
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/balance'), expect.any(Object));
  });

  it('uses balance data for API key billing accounts without token-plan quota', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const body = String(url).includes('/balance') ? balancePayload : apiKeyUsagePayload;
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const snapshot = await fetchUsageSnapshot({
      accountId: 'main',
      cookieHeader: 'userId=1',
      settings: { warnPercent: 80, criticalPercent: 95 },
      fetchImpl
    });

    expect(snapshot.quotaSummary).toEqual({
      source: 'api_key',
      used: 0,
      limit: 0,
      percent: 0,
      remaining: 92.5
    });
    expect(snapshot.balance?.currency).toBe('CNY');
  });

  it('maps HTTP auth failures to auth errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 }));

    await expect(
      fetchUsageSnapshot({
        accountId: 'main',
        cookieHeader: 'bad',
        settings: { warnPercent: 80, criticalPercent: 95 },
        fetchImpl
      })
    ).rejects.toMatchObject({ kind: 'auth' });
  });

  it('rejects non-zero API code', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ...okPayload, code: 10001, message: 'bad' })));

    await expect(
      fetchUsageSnapshot({
        accountId: 'main',
        cookieHeader: 'bad',
        settings: { warnPercent: 80, criticalPercent: 95 },
        fetchImpl
      })
    ).rejects.toBeInstanceOf(MimoUsageError);
  });

  it('rejects malformed responses', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 0, data: {} })));

    await expect(
      fetchUsageSnapshot({
        accountId: 'main',
        cookieHeader: 'bad',
        settings: { warnPercent: 80, criticalPercent: 95 },
        fetchImpl
      })
    ).rejects.toMatchObject({ kind: 'schema' });
  });
});
