export type UsageStatus =
  | 'ok'
  | 'warn'
  | 'critical'
  | 'stale'
  | 'login required'
  | 'unknown';

export interface Account {
  id: string;
  name: string;
  label?: string;
  userId: string;
  isDefault: boolean;
  profileDir: string;
  createdAt: string;
  updatedAt: string;
  lastRefreshAt?: string;
  lastError?: string;
}

export interface TokenBucket {
  name: string;
  used: number;
  limit: number;
  percent: number;
  remaining: number;
}

export interface UsageSnapshot {
  accountId: string;
  fetchedAt: string;
  monthUsage: TokenBucket[];
  planUsage: TokenBucket[];
  overallPercent: number;
  status: UsageStatus;
}

export interface Settings {
  refreshIntervalSeconds: number;
  warnPercent: number;
  criticalPercent: number;
  defaultAccountId?: string;
}

export interface AppConfig {
  version: 1;
  accounts: Account[];
  settings: Settings;
  snapshots: Record<string, UsageSnapshot>;
}

export interface MimoCookieSet {
  cookieHeader: string;
  userId: string;
  values: Record<string, string>;
}
