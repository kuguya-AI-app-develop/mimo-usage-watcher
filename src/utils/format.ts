import type { TokenBucket, UsageStatus } from '../types.js';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${trimFixed(value / 1_000_000_000)}B`;
  }
  if (abs >= 1_000_000) {
    return `${trimFixed(value / 1_000_000)}M`;
  }
  if (abs >= 1_000) {
    return `${trimFixed(value / 1_000)}K`;
  }
  return `${value}`;
}

export function formatBucket(bucket: TokenBucket): string {
  const limit = bucket.limit > 0 ? formatCompactNumber(bucket.limit) : 'unlimited';
  const remaining = bucket.limit > 0 ? formatCompactNumber(bucket.remaining) : '-';
  return `${bucket.name}: ${formatCompactNumber(bucket.used)} / ${limit} (${bucket.percent}%, left ${remaining})`;
}

export function progressBar(percent: number, width = 16): string {
  const safePercent = Math.max(0, Math.min(percent, 100));
  const filled = Math.round((safePercent / 100) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export function statusLabel(status: UsageStatus): string {
  return status.toUpperCase();
}

function trimFixed(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}
