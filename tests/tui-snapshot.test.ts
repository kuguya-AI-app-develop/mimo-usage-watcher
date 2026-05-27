import { describe, expect, it } from 'vitest';
import { createEmptyConfig, upsertAccount } from '../src/config.js';
import { renderDashboardSnapshot } from '../src/tui/snapshot.js';

describe('TUI snapshot rendering', () => {
  it('renders the empty dashboard state', () => {
    const output = renderDashboardSnapshot(createEmptyConfig());
    expect(output).toContain('No accounts yet');
    expect(output).toContain('Xiaomi MiMo Watcher');
  });

  it('renders accounts and usage status', () => {
    const config = upsertAccount(createEmptyConfig(), {
      id: 'main',
      name: 'main',
      label: 'Work',
      userId: '1464563959',
      isDefault: true,
      profileDir: '/tmp/profile',
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z'
    });
    config.snapshots.main = {
      accountId: 'main',
      fetchedAt: '2026-05-27T00:00:01.000Z',
      overallPercent: 90,
      status: 'warn',
      monthUsage: [{ name: 'month_total_token', used: 90, limit: 100, percent: 90, remaining: 10 }],
      planUsage: []
    };

    const output = renderDashboardSnapshot(config);
    expect(output).toContain('main (Work)');
    expect(output).toContain('WARN');
    expect(output).toContain('month_total_token');
  });
});
