import { describe, expect, it } from 'vitest';
import { calculateUsageStatus, normalizeBucket, snapshotWithStatus } from '../src/utils/status.js';

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
    expect(snapshot.status).toBe('warn');
  });
});
