import { z } from 'zod';
import { USAGE_URL } from './constants.js';
import type { Settings, UsageSnapshot } from './types.js';
import { normalizeBucket, snapshotWithStatus } from './utils/status.js';

const ApiBucketSchema = z.object({
  name: z.string(),
  used: z.number(),
  limit: z.number(),
  percent: z.number()
});

const UsageResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
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
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(USAGE_URL, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie: options.cookieHeader,
        'user-agent': 'xiaomi-mimo-watcher/0.1'
      }
    });
  } catch (error) {
    throw new MimoUsageError('network', 'Network request failed', error);
  }

  if (response.status === 401 || response.status === 403) {
    throw new MimoUsageError('auth', `Authentication failed with HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new MimoUsageError('api', `Usage API returned HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new MimoUsageError('schema', 'Usage API returned invalid JSON', error);
  }

  const parsed = UsageResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MimoUsageError('schema', 'Usage API response did not match expected schema', parsed.error);
  }

  if (parsed.data.code !== 0) {
    throw new MimoUsageError(
      parsed.data.code === 401 || parsed.data.code === 403 ? 'auth' : 'api',
      parsed.data.message || `Usage API returned code ${parsed.data.code}`
    );
  }

  return snapshotWithStatus(
    {
      accountId: options.accountId,
      fetchedAt: new Date().toISOString(),
      monthUsage: parsed.data.data.monthUsage.items.map(normalizeBucket),
      planUsage: parsed.data.data.usage.items.map(normalizeBucket)
    },
    options.settings
  );
}
