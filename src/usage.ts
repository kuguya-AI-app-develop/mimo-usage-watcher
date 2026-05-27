import { z } from 'zod';
import { BALANCE_URL, USAGE_URL } from './constants.js';
import type { BalanceSnapshot, Settings, TokenBucket, UsageSnapshot } from './types.js';
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

  if (tokenUsage || balance) {
    return snapshotWithStatus(
      {
        accountId: options.accountId,
        fetchedAt: new Date().toISOString(),
        monthUsage: tokenUsage?.monthUsage ?? [],
        planUsage: tokenUsage?.planUsage ?? [],
        balance
      },
      options.settings
    );
  }

  throw preferUsageError(tokenError, balanceError);
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

async function fetchJson(options: FetchUsageOptions, url: string, label: string): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie: options.cookieHeader,
        'user-agent': 'xiaomi-mimo-watcher/0.1'
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
  balanceError: MimoUsageError | undefined
): MimoUsageError {
  const errors = [tokenError, balanceError].filter((error): error is MimoUsageError => Boolean(error));
  const authError = errors.find((error) => error.kind === 'auth');
  if (authError) {
    return authError;
  }
  return tokenError ?? balanceError ?? new MimoUsageError('api', 'Usage and balance APIs did not return data');
}
