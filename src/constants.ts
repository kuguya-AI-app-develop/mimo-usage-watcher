export const APP_NAME = 'mimo-usage-watcher';
export const KEYCHAIN_SERVICE = 'xiaomi-mimo-watcher';
export const DEFAULT_CONFIG_DIR_NAME = '.mimo-watcher';
export const PLATFORM_ORIGIN = 'https://platform.xiaomimimo.com';
export const LOGIN_ENTRY_URL = `${PLATFORM_ORIGIN}/console/balance`;
export const USAGE_URL = `${PLATFORM_ORIGIN}/api/v1/tokenPlan/usage`;
export const TOKEN_PLAN_DETAIL_URL = `${PLATFORM_ORIGIN}/api/v1/tokenPlan/detail`;
export const BALANCE_URL = `${PLATFORM_ORIGIN}/api/v1/balance`;

export const REQUIRED_COOKIE_NAMES = [
  'api-platform_serviceToken',
  'userId',
  'api-platform_slh',
  'api-platform_ph'
] as const;

export const DEFAULT_REFRESH_INTERVAL_SECONDS = 60;
export const DEFAULT_WARN_PERCENT = 80;
export const DEFAULT_CRITICAL_PERCENT = 95;
