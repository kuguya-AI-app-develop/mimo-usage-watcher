import { z } from 'zod';
import { BALANCE_URL, TOKEN_PLAN_DETAIL_URL, USAGE_URL } from './constants.js';
import type { BalanceSnapshot, Settings, TokenBucket, TokenPlanDetail, UsageSnapshot } from './types.js';
import { normalizeBucket, snapshotWithStatus } from './utils/status.js';

const ApiAmountSchema = z.union([z.number(), z.string()]).transform((value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
});

const ApiBucketSchema = z.object({
  name: z.string(),
  used: z.number(),
  limit: z.number(),
  percent: z.number()
});

const UsageResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional().default(''),
  data: z.object({
    monthUsage: z.object({
      percent: z.number(),
      items: z.array(ApiBucketSchema)
    }),
    usage: z.object({
      percent: z.number(),
      items: z.array(ApiBucketSchema)
    })
  })
});

const BalanceDataSchema = z
  .object({
    balance: ApiAmountSchema,
    cashBalance: ApiAmountSchema,
    giftBalance: ApiAmountSchema,
    frozenBalance: ApiAmountSchema,
    overdraftLimit: ApiAmountSchema,
    remainingOverdraftLimit: ApiAmountSchema,
    currency: z.string().optional()
  })
  .passthrough();

const BalanceResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional().default(''),
  data: BalanceDataSchema
});

const ApiOptionalStringSchema = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

const ApiOptionalBooleanSchema = z
  .boolean()
  .nullish()
  .transform((value) => value ?? undefined);

const TokenPlanDetailDataSchema = z
  .object({
    planCode: ApiOptionalStringSchema,
    planName: ApiOptionalStringSchema,
    currentPeriodEnd: ApiOptionalStringSchema,
    expired: ApiOptionalBooleanSchema,
    hasAutoRenewSubscribed: ApiOptionalBooleanSchema,
    enableAutoRenew: ApiOptionalBooleanSchema
  })
  .passthrough();

const TokenPlanDetailResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional().default(''),
  data: TokenPlanDetailDataSchema.nullish()
});

export type UsageErrorKind = 'auth' | 'api' | 'network' | 'schema';

export class MimoUsageError extends Error {
  constructor(
    readonly kind: UsageErrorKind,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'MimoUsageError';
  }
}

export interface FetchUsageOptions {
  accountId: string;
  cookieHeader: string;
  settings: Pick<Settings, 'warnPercent' | 'criticalPercent'>;
  fetchImpl?: typeof fetch;
}

export async function fetchUsageSnapshot(options: FetchUsageOptions): Promise<UsageSnapshot> {
  let tokenUsage: { monthUsage: TokenBucket[]; planUsage: TokenBucket[] } | undefined;
  let tokenError: MimoUsageError | undefined;

  try {
    tokenUsage = await fetchTokenUsage(options);
  } catch (error) {
    tokenError = asMimoUsageError(error);
    if (tokenError.kind === 'auth') {
      throw tokenError;
    }
  }

  let balance: BalanceSnapshot | undefined;
  let balanceError: MimoUsageError | undefined;
  try {
    balance = await fetchBalance(options);
  } catch (error) {
    balanceError = asMimoUsageError(error);
  }

  let tokenPlan: TokenPlanDetail | undefined;
  let tokenPlanError: MimoUsageError | undefined;
  try {
    tokenPlan = await fetchTokenPlanDetail(options);
  } catch (error) {
    tokenPlanError = asMimoUsageError(error);
  }

  if (tokenUsage || balance || tokenPlan) {
    return snapshotWithStatus(
      {
        accountId: options.accountId,
        fetchedAt: new Date().toISOString(),
        monthUsage: tokenUsage?.monthUsage ?? [],
        planUsage: tokenUsage?.planUsage ?? [],
        balance,
        tokenPlan
      },
      options.settings
    );
  }

  throw preferUsageError(tokenError, balanceError, tokenPlanError);
}

async function fetchTokenUsage(options: FetchUsageOptions): Promise<{ monthUsage: TokenBucket[]; planUsage: TokenBucket[] }> {
  const response = await fetchJson(options, USAGE_URL, 'Usage API');

  const parsed = UsageResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new MimoUsageError('schema', 'Usage API response did not match expected schema', parsed.error);
  }

  if (parsed.data.code !== 0) {
    throw new MimoUsageError(
      parsed.data.code === 401 || parsed.data.code === 403 ? 'auth' : 'api',
      parsed.data.message || `Usage API returned code ${parsed.data.code}`
    );
  }

  return {
    monthUsage: parsed.data.data.monthUsage.items.map(normalizeBucket),
    planUsage: parsed.data.data.usage.items.map(normalizeBucket)
  };
}

async function fetchBalance(options: FetchUsageOptions): Promise<BalanceSnapshot> {
  const response = await fetchJson(options, BALANCE_URL, 'Balance API');

  const parsed = BalanceResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new MimoUsageError('schema', 'Balance API response did not match expected schema', parsed.error);
  }

  if (parsed.data.code !== 0) {
    throw new MimoUsageError(
      parsed.data.code === 401 || parsed.data.code === 403 ? 'auth' : 'api',
      parsed.data.message || `Balance API returned code ${parsed.data.code}`
    );
  }

  return parsed.data.data;
}

async function fetchTokenPlanDetail(options: FetchUsageOptions): Promise<TokenPlanDetail | undefined> {
  const response = await fetchJson(options, TOKEN_PLAN_DETAIL_URL, 'Token plan detail API');

  const parsed = TokenPlanDetailResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new MimoUsageError('schema', 'Token plan detail API response did not match expected schema', parsed.error);
  }

  if (parsed.data.code !== 0) {
    throw new MimoUsageError(
      parsed.data.code === 401 || parsed.data.code === 403 ? 'auth' : 'api',
      parsed.data.message || `Token plan detail API returned code ${parsed.data.code}`
    );
  }

  const detail = parsed.data.data ?? undefined;
  if (!detail || !hasTokenPlanDetail(detail)) {
    return undefined;
  }

  return detail;
}

async function fetchJson(options: FetchUsageOptions, url: string, label: string): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie: options.cookieHeader,
        'user-agent': 'mimo-usage-watcher/0.1'
      }
    });
  } catch (error) {
    throw new MimoUsageError('network', `${label} network request failed`, error);
  }

  if (response.status === 401 || response.status === 403) {
    throw new MimoUsageError('auth', `${label} authentication failed with HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new MimoUsageError('api', `${label} returned HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new MimoUsageError('schema', `${label} returned invalid JSON`, error);
  }
}

function asMimoUsageError(error: unknown): MimoUsageError {
  if (error instanceof MimoUsageError) {
    return error;
  }
  return new MimoUsageError('api', error instanceof Error ? error.message : String(error), error);
}

function preferUsageError(
  tokenError: MimoUsageError | undefined,
  balanceError: MimoUsageError | undefined,
  tokenPlanError?: MimoUsageError
): MimoUsageError {
  const errors = [tokenError, balanceError, tokenPlanError].filter((error): error is MimoUsageError => Boolean(error));
  const authError = errors.find((error) => error.kind === 'auth');
  if (authError) {
    return authError;
  }
  return tokenError ?? balanceError ?? tokenPlanError ?? new MimoUsageError('api', 'Usage and balance APIs did not return data');
}

function hasTokenPlanDetail(detail: TokenPlanDetail): boolean {
  return Boolean(
    detail.planCode ||
      detail.planName ||
      detail.currentPeriodEnd ||
      detail.expired !== undefined ||
      detail.hasAutoRenewSubscribed !== undefined ||
      detail.enableAutoRenew !== undefined
  );
}
