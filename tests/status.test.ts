import { describe, expect, it } from 'vitest';
import { calculateUsageStatus, normalizeBucket, snapshotWithStatus, summarizeQuota } from '../src/utils/status.js';

describe('usage status', () => {
  it('does not trigger thresholds for unlimited zero-limit buckets', () => {
    const bucket = normalizeBucket({
      name: 'compensation_total_token',
      used: 0,
      limit: 0,
      percent: 100
    });

    expect(bucket.remaining).toBe(0);
    expect(calculateUsageStatus([bucket], { warnPercent: 80, criticalPercent: 95 })).toBe('ok');
  });

  it('classifies warning and critical usage by percent', () => {
    expect(
      calculateUsageStatus(
        [
          normalizeBucket({
            name: 'plan_total_token',
            used: 90,
            limit: 100,
            percent: 90
          })
        ],
        { warnPercent: 80, criticalPercent: 95 }
      )
    ).toBe('warn');

    expect(
      calculateUsageStatus(
        [
          normalizeBucket({
            name: 'plan_total_token',
            used: 96,
            limit: 100,
            percent: 96
          })
        ],
        { warnPercent: 80, criticalPercent: 95 }
      )
    ).toBe('critical');
  });

  it('adds overall percent and status to snapshots', () => {
    const snapshot = snapshotWithStatus(
      {
        accountId: 'main',
        fetchedAt: '2026-05-27T00:00:00.000Z',
        monthUsage: [
          normalizeBucket({
            name: 'month_total_token',
            used: 10,
            limit: 100,
            percent: 10
          })
        ],
        planUsage: [
          normalizeBucket({
            name: 'plan_total_token',
            used: 82,
            limit: 100,
            percent: 82
          })
        ]
      },
      { warnPercent: 80, criticalPercent: 95 }
    );

    expect(snapshot.overallPercent).toBe(82);
    expect(snapshot.quotaSummary).toMatchObject({
      source: 'token_plan',
      used: 82,
      limit: 100,
      remaining: 18
    });
    expect(snapshot.status).toBe('warn');
  });

  it('prefers the plan total bucket for remaining quota', () => {
    const quota = summarizeQuota(
      [
        normalizeBucket({
          name: 'month_total_token',
          used: 20,
          limit: 200,
          percent: 10
        })
      ],
      [
        normalizeBucket({
          name: 'plan_total_token',
          used: 75,
          limit: 300,
          percent: 25
        })
      ]
    );

    expect(quota).toEqual({
      source: 'token_plan',
      used: 75,
      limit: 300,
      percent: 25,
      remaining: 225
    });
  });

  it('marks accounts without positive token-plan quota as API key balance usage', () => {
    const quota = summarizeQuota(
      [
        normalizeBucket({
          name: 'month_total_token',
          used: 0,
          limit: 0,
          percent: 0
        })
      ],
      [
        normalizeBucket({
          name: 'compensation_total_token',
          used: 0,
          limit: 0,
          percent: 0
        })
      ],
      {
        balance: 12.5,
        cashBalance: 10,
        giftBalance: 2.5,
        frozenBalance: 0,
        overdraftLimit: 100,
        remainingOverdraftLimit: 80,
        currency: 'CNY'
      }
    );

    expect(quota.source).toBe('api_key');
    expect(quota.limit).toBe(0);
    expect(quota.remaining).toBe(92.5);
  });

  it('marks accounts with token-plan quota and balance data as mixed quota', () => {
    const quota = summarizeQuota(
      [],
      [
        normalizeBucket({
          name: 'plan_total_token',
          used: 20,
          limit: 100,
          percent: 20
        })
      ],
      {
        balance: 12.5,
        cashBalance: 10,
        giftBalance: 2.5,
        frozenBalance: 0,
        overdraftLimit: 100,
        remainingOverdraftLimit: 80,
        currency: 'CNY'
      }
    );

    expect(quota).toMatchObject({
      source: 'mixed',
      used: 20,
      limit: 100,
      remaining: 80
    });
  });

  it('does not assume API key billing without balance data', () => {
    const quota = summarizeQuota(
      [],
      [
        normalizeBucket({
          name: 'compensation_total_token',
          used: 0,
          limit: 0,
          percent: 0
        })
      ]
    );

    expect(quota.source).toBe('unknown');
  });
});
