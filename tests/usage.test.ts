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

describe('fetchUsageSnapshot', () => {
  it('parses usage API responses', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(okPayload), { status: 200 }));
    const snapshot = await fetchUsageSnapshot({
      accountId: 'main',
      cookieHeader: 'userId=1',
      settings: { warnPercent: 80, criticalPercent: 95 },
      fetchImpl
    });

    expect(snapshot.accountId).toBe('main');
    expect(snapshot.monthUsage[0]?.remaining).toBe(90);
    expect(snapshot.planUsage[0]?.name).toBe('plan_total_token');
    expect(snapshot.status).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/tokenPlan/usage'), expect.any(Object));
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
