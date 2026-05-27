import type { Settings, TokenBucket, UsageSnapshot, UsageStatus } from '../types.js';

export function bucketRemaining(bucket: { used: number; limit: number }): number {
  if (bucket.limit <= 0) {
    return 0;
  }
  return Math.max(bucket.limit - bucket.used, 0);
}

export function normalizeBucket(bucket: {
  name: string;
  used: number;
  limit: number;
  percent: number;
}): TokenBucket {
  return {
    name: bucket.name,
    used: bucket.used,
    limit: bucket.limit,
    percent: bucket.percent,
    remaining: bucketRemaining(bucket)
  };
}

export function calculateOverallPercent(buckets: TokenBucket[]): number {
  const limited = buckets.filter((bucket) => bucket.limit > 0);
  if (limited.length === 0) {
    return 0;
  }
  return Math.max(...limited.map((bucket) => bucket.percent));
}

export function calculateUsageStatus(
  buckets: TokenBucket[],
  settings: Pick<Settings, 'warnPercent' | 'criticalPercent'>
): UsageStatus {
  const percent = calculateOverallPercent(buckets);
  if (percent >= settings.criticalPercent) {
    return 'critical';
  }
  if (percent >= settings.warnPercent) {
    return 'warn';
  }
  return 'ok';
}

export function snapshotWithStatus(
  snapshot: Omit<UsageSnapshot, 'overallPercent' | 'status'>,
  settings: Pick<Settings, 'warnPercent' | 'criticalPercent'>
): UsageSnapshot {
  const buckets = [...snapshot.monthUsage, ...snapshot.planUsage];
  const overallPercent = calculateOverallPercent(buckets);
  return {
    ...snapshot,
    overallPercent,
    status: calculateUsageStatus(buckets, settings)
  };
}
