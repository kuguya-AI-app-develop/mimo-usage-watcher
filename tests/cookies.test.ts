import { describe, expect, it } from 'vitest';
import {
  cookieHeaderFromBrowserCookies,
  cookieValuesFromBrowserCookies,
  parseCookieHeader,
  redactCookieHeader,
  validateMimoCookieHeader
} from '../src/utils/cookies.js';

const VALID_COOKIE =
  'api-platform_serviceToken=token=with=equals; userId=1464563959; api-platform_slh=abc123==; api-platform_ph=def456==';

describe('cookie utilities', () => {
  it('parses cookie values that contain equals signs', () => {
    const parsed = parseCookieHeader(VALID_COOKIE);
    expect(parsed['api-platform_serviceToken']).toBe('token=with=equals');
    expect(parsed.userId).toBe('1464563959');
  });

  it('validates required Xiaomi MiMo cookies', () => {
    const result = validateMimoCookieHeader(VALID_COOKIE);
    expect(result.userId).toBe('1464563959');
    expect(result.cookieHeader).toContain('api-platform_serviceToken=token=with=equals');
  });

  it('rejects missing login cookies', () => {
    expect(() => validateMimoCookieHeader('userId=1')).toThrow(/Missing required cookie/);
  });

  it('builds a cookie header from browser cookies', () => {
    const result = cookieHeaderFromBrowserCookies([
      { name: 'api-platform_serviceToken', value: 'token' },
      { name: 'userId', value: '1464563959' },
      { name: 'api-platform_slh', value: 'slh' },
      { name: 'api-platform_ph', value: 'ph' }
    ]);

    expect(result.cookieHeader).toContain('api-platform_ph=ph');
  });

  it('extracts browser cookie values for request-header merging', () => {
    const result = cookieValuesFromBrowserCookies([
      { name: 'api-platform_serviceToken', value: 'token' },
      { name: 'empty', value: '' }
    ]);

    expect(result).toEqual({ 'api-platform_serviceToken': 'token' });
  });

  it('redacts secrets without removing cookie names', () => {
    const redacted = redactCookieHeader(VALID_COOKIE);
    expect(redacted).toContain('api-platform_serviceToken=');
    expect(redacted).not.toContain('token=with=equals');
    expect(redacted).not.toContain('abc123==');
  });
});
