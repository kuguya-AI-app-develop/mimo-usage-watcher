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

export interface ApiKeyRef {
  id: string;
  accountId: string;
  label?: string;
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
  lastCopiedAt?: string;
}

export interface TokenBucket {
  name: string;
  used: number;
  limit: number;
  percent: number;
  remaining: number;
}

export type QuotaSource = 'token_plan' | 'api_key' | 'mixed' | 'unknown';

export interface BalanceSnapshot {
  balance: number;
  cashBalance: number;
  giftBalance: number;
  frozenBalance: number;
  overdraftLimit: number;
  remainingOverdraftLimit: number;
  currency?: string;
}

export interface TokenPlanDetail {
  planCode?: string;
  planName?: string;
  currentPeriodEnd?: string;
  expired?: boolean;
  hasAutoRenewSubscribed?: boolean;
  enableAutoRenew?: boolean;
}

export interface QuotaSummary {
  source: QuotaSource;
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
  balance?: BalanceSnapshot;
  tokenPlan?: TokenPlanDetail;
  quotaSummary: QuotaSummary;
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
  apiKeys: ApiKeyRef[];
  settings: Settings;
  snapshots: Record<string, UsageSnapshot>;
}

export interface MimoCookieSet {
  cookieHeader: string;
  userId: string;
  values: Record<string, string>;
}
