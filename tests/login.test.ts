import { describe, expect, it } from 'vitest';
import { validateManualCookie } from '../src/login.js';
import { cookieHeaderFromBrowserCookies } from '../src/utils/cookies.js';

describe('login helpers', () => {
  it('validates manually pasted cookies', () => {
    const result = validateManualCookie(
      'api-platform_serviceToken=token; userId=1464563959; api-platform_slh=slh; api-platform_ph=ph'
    );

    expect(result.userId).toBe('1464563959');
  });

  it('extracts login cookies from browser cookie arrays', () => {
    const result = cookieHeaderFromBrowserCookies([
      { name: 'api-platform_serviceToken', value: 'token', domain: '.platform.xiaomimimo.com' },
      { name: 'userId', value: '1464563959', domain: '.platform.xiaomimimo.com' },
      { name: 'api-platform_slh', value: 'slh', domain: '.platform.xiaomimimo.com' },
      { name: 'api-platform_ph', value: 'ph', domain: '.platform.xiaomimimo.com' }
    ]);

    expect(result.cookieHeader).toContain('api-platform_serviceToken=token');
  });
});
