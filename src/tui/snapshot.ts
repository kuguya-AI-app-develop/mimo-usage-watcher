import type { Account, AppConfig, UsageSnapshot } from '../types.js';
import { formatBucket, progressBar, statusLabel } from '../utils/format.js';

export interface DashboardSnapshotOptions {
  selectedAccountId?: string;
  searchQuery?: string;
  statusLine?: string;
}

export function renderDashboardSnapshot(
  config: AppConfig,
  options: DashboardSnapshotOptions = {}
): string {
  const accounts = filterAccounts(config.accounts, options.searchQuery);
  const selected = selectAccount(accounts, options.selectedAccountId);
  const lines: string[] = [];

  lines.push('Xiaomi MiMo Watcher');
  lines.push(summaryLine(config));
  lines.push('');
  lines.push('Accounts');

  if (accounts.length === 0) {
    lines.push('  No accounts yet. Press a to login or p to paste a cookie.');
  } else {
    for (const account of accounts) {
      const snapshot = config.snapshots[account.id];
      const marker = account.id === selected?.id ? '>' : ' ';
      const defaultMarker = account.isDefault ? '*' : ' ';
      const percent = snapshot?.overallPercent ?? 0;
      const status = snapshot?.status ?? 'unknown';
      const label = account.label ? ` (${account.label})` : '';
      lines.push(
        `${marker}${defaultMarker} ${account.name}${label} ${progressBar(percent, 12)} ${percent}% ${statusLabel(status)}`
      );
    }
  }

  lines.push('');
  lines.push('Details');
  if (!selected) {
    lines.push('  No account selected.');
  } else {
    lines.push(...renderAccountDetails(selected, config.snapshots[selected.id]));
  }

  lines.push('');
  lines.push(options.statusLine || 'a login | p paste | r refresh | u default | e label | d delete | / search | ? help | q quit');
  return lines.join('\n');
}

export function filterAccounts(accounts: Account[], query = ''): Account[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return accounts;
  }
  return accounts.filter((account) =>
    [account.name, account.label, account.userId]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalized))
  );
}

export function renderAccountDetails(account: Account, snapshot?: UsageSnapshot): string[] {
  const lines = [
    `  Name: ${account.name}`,
    `  Label: ${account.label || '-'}`,
    `  User ID: ${account.userId}`,
    `  Default: ${account.isDefault ? 'yes' : 'no'}`,
    `  Last refresh: ${account.lastRefreshAt || '-'}`
  ];

  if (account.lastError) {
    lines.push(`  Last error: ${account.lastError}`);
  }

  if (!snapshot) {
    lines.push('  Usage: no snapshot');
    return lines;
  }

  lines.push(`  Status: ${statusLabel(snapshot.status)} (${snapshot.overallPercent}%)`);
  lines.push('  Month usage:');
  if (snapshot.monthUsage.length === 0) {
    lines.push('    -');
  } else {
    lines.push(...snapshot.monthUsage.map((bucket) => `    ${formatBucket(bucket)}`));
  }
  lines.push('  Plan usage:');
  if (snapshot.planUsage.length === 0) {
    lines.push('    -');
  } else {
    lines.push(...snapshot.planUsage.map((bucket) => `    ${formatBucket(bucket)}`));
  }
  return lines;
}

function selectAccount(accounts: Account[], selectedAccountId?: string): Account | undefined {
  if (accounts.length === 0) {
    return undefined;
  }
  return accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
}

function summaryLine(config: AppConfig): string {
  const snapshots = Object.values(config.snapshots);
  const critical = snapshots.filter((snapshot) => snapshot.status === 'critical').length;
  const warn = snapshots.filter((snapshot) => snapshot.status === 'warn').length;
  const stale = snapshots.filter(
    (snapshot) => snapshot.status === 'stale' || snapshot.status === 'login required'
  ).length;
  return `Accounts: ${config.accounts.length} | Critical: ${critical} | Warn: ${warn} | Needs attention: ${stale}`;
}
