import React, { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, BalanceSnapshot } from '../src/types.js';
import { createEmptyConfig, upsertAccount } from '../src/config.js';

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original, useState: vi.fn(original.useState) };
});

import { App } from '../src/renderer/src/App.js';

function renderBalance(balance?: BalanceSnapshot): string {
  const config: AppConfig = upsertAccount(createEmptyConfig(), {
    id: 'demo', name: 'Demo', userId: '1', isDefault: true, profileDir: '/test-only',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  });
  config.snapshots.demo = {
    accountId: 'demo', fetchedAt: '2026-01-01T00:00:00.000Z', monthUsage: [], planUsage: [],
    balance, quotaSummary: { source: balance ? 'api_key' : 'unknown', used: 0, limit: 0, percent: 0, remaining: 0 },
    overallPercent: 0, status: 'ok'
  };
  vi.mocked(useState).mockImplementationOnce(() => [config, vi.fn()]);
  return renderToStaticMarkup(<App />);
}

const zero: BalanceSnapshot = {
  balance: 0, cashBalance: 0, giftBalance: 0, frozenBalance: 0,
  overdraftLimit: 0, remainingOverdraftLimit: 0, currency: 'CNY'
};

describe('account balance display', () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    ['zero', zero, 'CNY 0'],
    ['negative', { ...zero, balance: -3, cashBalance: -3 }, 'CNY -3'],
    ['overdraft', { ...zero, overdraftLimit: 10, remainingOverdraftLimit: 5 }, 'CNY 5']
  ])('shows returned %s balance data', (_name, balance, value) => {
    const html = renderBalance(balance as BalanceSnapshot);
    expect(html).toContain('Account Balance');
    expect(html).toContain('API Balance');
    expect(html).toContain(value);
    expect(html).not.toContain('No quota data');
  });

  it('shows the empty quota state when no balance was returned', () => {
    const html = renderBalance();
    expect(html).not.toContain('Account Balance');
    expect(html).toContain('No quota data');
  });
});
