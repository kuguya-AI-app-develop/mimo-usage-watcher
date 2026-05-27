import type { QuotaSummary, Settings, TokenBucket, UsageSnapshot, UsageStatus } from '../types.js';

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

export function summarizeQuota(monthUsage: TokenBucket[], planUsage: TokenBucket[]): QuotaSummary {
  const buckets = [...monthUsage, ...planUsage];
  const limitedBuckets = buckets.filter((bucket) => bucket.limit > 0);
  const tokenPlanBuckets = limitedBuckets.filter(isTokenPlanBucket);
  const otherLimitedBuckets = limitedBuckets.filter((bucket) => !isTokenPlanBucket(bucket));
  const primaryBucket = selectPrimaryQuotaBucket(tokenPlanBuckets, otherLimitedBuckets, buckets);

  return {
    source: quotaSource(tokenPlanBuckets, otherLimitedBuckets, buckets),
    used: primaryBucket?.used ?? 0,
    limit: primaryBucket?.limit ?? 0,
    percent: primaryBucket?.percent ?? 0,
    remaining: primaryBucket?.remaining ?? 0
  };
}

export function snapshotWithStatus(
  snapshot: Omit<UsageSnapshot, 'overallPercent' | 'quotaSummary' | 'status'>,
  settings: Pick<Settings, 'warnPercent' | 'criticalPercent'>
): UsageSnapshot {
  const buckets = [...snapshot.monthUsage, ...snapshot.planUsage];
  const overallPercent = calculateOverallPercent(buckets);
  return {
    ...snapshot,
    quotaSummary: summarizeQuota(snapshot.monthUsage, snapshot.planUsage),
    overallPercent,
    status: calculateUsageStatus(buckets, settings)
  };
}

function quotaSource(
  tokenPlanBuckets: TokenBucket[],
  otherLimitedBuckets: TokenBucket[],
  allBuckets: TokenBucket[]
): QuotaSummary['source'] {
  if (tokenPlanBuckets.length > 0 && otherLimitedBuckets.length > 0) {
    return 'mixed';
  }
  if (tokenPlanBuckets.length > 0) {
    return 'token_plan';
  }
  if (allBuckets.length > 0) {
    return 'api_key';
  }
  return 'unknown';
}

function selectPrimaryQuotaBucket(
  tokenPlanBuckets: TokenBucket[],
  otherLimitedBuckets: TokenBucket[],
  allBuckets: TokenBucket[]
): TokenBucket | undefined {
  return (
    tokenPlanBuckets.find((bucket) => bucket.name === 'plan_total_token') ??
    tokenPlanBuckets.find((bucket) => bucket.name === 'month_total_token') ??
    highestPercentBucket(tokenPlanBuckets) ??
    highestPercentBucket(otherLimitedBuckets) ??
    allBuckets.find((bucket) => bucket.name === 'plan_total_token') ??
    allBuckets.find((bucket) => bucket.name === 'month_total_token') ??
    highestPercentBucket(allBuckets)
  );
}

function highestPercentBucket(buckets: TokenBucket[]): TokenBucket | undefined {
  return buckets.reduce<TokenBucket | undefined>((selected, bucket) => {
    if (!selected || bucket.percent > selected.percent) {
      return bucket;
    }
    return selected;
  }, undefined);
}

function isTokenPlanBucket(bucket: TokenBucket): boolean {
  return bucket.name === 'plan_total_token' || bucket.name === 'month_total_token';
}
