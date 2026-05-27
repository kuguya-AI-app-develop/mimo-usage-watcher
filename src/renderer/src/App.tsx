import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  Copy,
  KeyRound,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2
} from 'lucide-react';
import type { Account, ApiKeyRef, AppConfig, TokenBucket, UsageSnapshot, UsageStatus } from '../../types.js';
import {
  DEFAULT_CRITICAL_PERCENT,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  DEFAULT_WARN_PERCENT
} from '../../constants.js';
import { formatCompactNumber, formatNumber } from '../../utils/format.js';
import { unwrap } from './api.js';

type DialogMode =
  | { type: 'edit-label'; account: Account }
  | { type: 'delete'; account: Account }
  | { type: 'add-api-key'; account: Account }
  | { type: 'delete-api-key'; account: Account; apiKey: ApiKeyRef }
  | null;

export function App(): React.ReactElement {
  const [config, setConfig] = useState<AppConfig>(createEmptyRendererConfig());
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading local account data...');
  const refreshInFlightRef = useRef(false);

  const accounts = useMemo(() => filterAccounts(config.accounts, query), [config.accounts, query]);
  const selected = accounts.find((account) => account.id === selectedId) ?? accounts[0];
  const selectedSnapshot = selected ? config.snapshots[selected.id] : undefined;
  const selectedApiKeys = selected ? config.apiKeys.filter((apiKey) => apiKey.accountId === selected.id) : [];
  const summary = useMemo(() => summarize(config), [config]);

  useEffect(() => {
    void run(async () => {
      const next = await unwrap(await window.mimo.load());
      setConfig(next);
      setSelectedId(next.settings.defaultAccountId ?? next.accounts[0]?.id);
      setStatus(
        next.accounts.length
          ? `Ready. Auto-refreshing every ${next.settings.refreshIntervalSeconds}s.`
          : 'No accounts yet. Add a MiMo account to begin.'
      );
      if (next.accounts.length > 0) {
        window.setTimeout(() => {
          void refreshAll('auto');
        }, 0);
      }
    }, false);
  }, []);

  useEffect(() => {
    if (config.accounts.length === 0) {
      return;
    }
    const intervalSeconds = Math.max(config.settings.refreshIntervalSeconds, 15);
    const timer = window.setInterval(() => {
      void refreshAll('auto');
    }, intervalSeconds * 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [config.accounts.length, config.settings.refreshIntervalSeconds]);

  async function run(action: () => Promise<void>, showBusy = true): Promise<void> {
    if (showBusy) {
      setBusy(true);
    }
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (showBusy) {
        setBusy(false);
      }
    }
  }

  async function refreshAll(mode: 'manual' | 'auto' = 'manual'): Promise<void> {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    await run(
      async () => {
        setStatus(mode === 'manual' ? 'Refreshing all accounts...' : 'Auto-refreshing all accounts...');
        const next = await unwrap(await window.mimo.refreshAll());
        setConfig(next);
        setStatus(
          `${mode === 'manual' ? 'Refreshed' : 'Auto-refreshed'} ${next.accounts.length} account${
            next.accounts.length === 1 ? '' : 's'
          } at ${shortTime(new Date().toISOString())}.`
        );
      },
      mode === 'manual'
    );
    refreshInFlightRef.current = false;
  }

  async function setDefault(account: Account): Promise<void> {
    await run(async () => {
      const next = await unwrap(await window.mimo.setDefault(account.id));
      setConfig(next);
      setSelectedId(account.id);
      setStatus(`${account.name} is now the default account.`);
    });
  }

  async function deleteAccount(account: Account): Promise<void> {
    await run(async () => {
      const next = await unwrap(await window.mimo.remove(account.id));
      setConfig(next);
      setSelectedId(next.settings.defaultAccountId ?? next.accounts[0]?.id);
      setDialog(null);
      setStatus(`${account.name} was removed.`);
    });
  }

  async function saveLabel(account: Account, label: string): Promise<void> {
    await run(async () => {
      const next = await unwrap(await window.mimo.renameLabel(account.id, label));
      setConfig(next);
      setDialog(null);
      setStatus('Label updated.');
    });
  }

  async function addApiKey(account: Account, label: string, apiKey: string): Promise<void> {
    await run(async () => {
      const next = await unwrap(await window.mimo.addApiKey({ accountId: account.id, label, apiKey }));
      setConfig(next);
      setDialog(null);
      setStatus('API key was saved locally.');
    });
  }

  async function copyApiKey(account: Account, apiKey: ApiKeyRef): Promise<void> {
    await run(async () => {
      const next = await unwrap(await window.mimo.copyApiKey(account.id, apiKey.id));
      setConfig(next);
      setStatus(`${apiKey.label || 'API key'} copied to clipboard.`);
    });
  }

  async function deleteApiKey(account: Account, apiKey: ApiKeyRef): Promise<void> {
    await run(async () => {
      const next = await unwrap(await window.mimo.removeApiKey(account.id, apiKey.id));
      setConfig(next);
      setDialog(null);
      setStatus(`${apiKey.label || 'API key'} was removed.`);
    });
  }

  async function login(input: { name?: string; label?: string } = {}): Promise<void> {
    await run(async () => {
      setStatus('Opening Xiaomi login window...');
      const beforeIds = new Set(config.accounts.map((account) => account.id));
      const next = await unwrap(await window.mimo.login(input));
      setConfig(next);
      const account =
        next.accounts.find((candidate) => !beforeIds.has(candidate.id)) ??
        (input.name ? next.accounts.find((candidate) => candidate.name === input.name) : undefined);
      setSelectedId(account?.id ?? next.settings.defaultAccountId ?? next.accounts[0]?.id);
      setDialog(null);
      setStatus(`Logged in and refreshed ${account?.name ?? 'MiMo account'}.`);
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Xiaomi MiMo</div>
          <h1>Usage Watcher</h1>
        </div>
        <div className="topbar-actions">
          <button className="button secondary" onClick={() => void refreshAll()} disabled={busy || config.accounts.length === 0}>
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>
      </header>

      <section className="summary-grid">
        <SummaryTile label="Accounts" value={summary.accounts} />
        <SummaryTile label="Healthy" value={summary.ok} tone="ok" />
        <SummaryTile label="Warning" value={summary.warn} tone="warn" />
        <SummaryTile label="Needs Attention" value={summary.needsAttention} tone="critical" />
      </section>

      <section className="workspace">
        <aside className="account-panel">
          <div className="panel-header">
            <div className="panel-title-row">
              <h2>Accounts</h2>
              {config.accounts.length > 0 ? (
                <button className="button secondary compact" onClick={() => void login()} disabled={busy}>
                  <LogIn size={16} />
                  Add Account
                </button>
              ) : null}
            </div>
            <div className="search-box">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, label, userId" />
            </div>
          </div>

          <div className="account-list">
            {accounts.length === 0 ? (
              <div className="empty-state">
                <CircleAlert size={22} />
                <p>No MiMo accounts are saved locally.</p>
                <button className="button primary" onClick={() => void login()} disabled={busy}>
                  <LogIn size={17} />
                  Login & Import
                </button>
              </div>
            ) : (
              accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  snapshot={config.snapshots[account.id]}
                  selected={account.id === selected?.id}
                  onSelect={() => setSelectedId(account.id)}
                />
              ))
            )}
          </div>
        </aside>

        <section className="detail-panel">
          {selected ? (
            <AccountDetail
              account={selected}
              snapshot={selectedSnapshot}
              apiKeys={selectedApiKeys}
              busy={busy}
              onSetDefault={() => void setDefault(selected)}
              onEdit={() => setDialog({ type: 'edit-label', account: selected })}
              onDelete={() => setDialog({ type: 'delete', account: selected })}
              onAddApiKey={() => setDialog({ type: 'add-api-key', account: selected })}
              onCopyApiKey={(apiKey) => void copyApiKey(selected, apiKey)}
              onDeleteApiKey={(apiKey) => setDialog({ type: 'delete-api-key', account: selected, apiKey })}
            />
          ) : (
            <div className="empty-detail">
              <CircleCheck size={30} />
              <h2>No account selected</h2>
              <p>Use Login & Import to add a Xiaomi MiMo account and fetch token plan usage plus API key balance.</p>
            </div>
          )}
        </section>
      </section>

      <footer className="statusbar">
        <span className={busy ? 'pulse-dot active' : 'pulse-dot'} />
        <span>{status}</span>
      </footer>

      {dialog?.type === 'edit-label' ? (
        <LabelDialog account={dialog.account} busy={busy} onCancel={() => setDialog(null)} onSubmit={saveLabel} />
      ) : null}
      {dialog?.type === 'delete' ? (
        <ConfirmDeleteDialog account={dialog.account} busy={busy} onCancel={() => setDialog(null)} onConfirm={deleteAccount} />
      ) : null}
      {dialog?.type === 'add-api-key' ? (
        <ApiKeyDialog account={dialog.account} busy={busy} onCancel={() => setDialog(null)} onSubmit={addApiKey} />
      ) : null}
      {dialog?.type === 'delete-api-key' ? (
        <ConfirmDeleteApiKeyDialog
          account={dialog.account}
          apiKey={dialog.apiKey}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={deleteApiKey}
        />
      ) : null}
    </main>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'neutral'
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'ok' | 'warn' | 'critical';
}): React.ReactElement {
  return (
    <div className={`summary-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AccountRow({
  account,
  snapshot,
  selected,
  onSelect
}: {
  account: Account;
  snapshot?: UsageSnapshot;
  selected: boolean;
  onSelect: () => void;
}): React.ReactElement {
  const status = snapshot?.status ?? 'unknown';
  const percent = snapshot?.overallPercent ?? 0;

  return (
    <button className={`account-row ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="account-row-main">
        <div>
          <div className="account-name">
            {account.isDefault ? <Star size={14} fill="currentColor" /> : null}
            {account.name}
          </div>
          <div className="account-meta">{account.label || account.userId}</div>
        </div>
        <StatusPill status={status} />
      </div>
      <div className="progress-track">
        <div className={`progress-fill ${statusClass(status)}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <div className="account-row-footer">
        <span>{percent}% used</span>
        <span>{account.lastRefreshAt ? shortTime(account.lastRefreshAt) : 'not refreshed'}</span>
      </div>
    </button>
  );
}

function AccountDetail({
  account,
  snapshot,
  apiKeys,
  busy,
  onSetDefault,
  onEdit,
  onDelete,
  onAddApiKey,
  onCopyApiKey,
  onDeleteApiKey
}: {
  account: Account;
  snapshot?: UsageSnapshot;
  apiKeys: ApiKeyRef[];
  busy: boolean;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddApiKey: () => void;
  onCopyApiKey: (apiKey: ApiKeyRef) => void;
  onDeleteApiKey: (apiKey: ApiKeyRef) => void;
}): React.ReactElement {
  const tokenPlanLabel = snapshot ? resolveTokenPlanLabel(snapshot) : undefined;
  const hasApiBalance = snapshot?.balance ? balanceAvailable(snapshot.balance) > 0 : false;

  return (
    <>
      <div className="detail-header">
        <div>
          <div className="eyebrow">Selected Account</div>
          <h2>{account.name}</h2>
          <p>{account.label || 'No label'} · userId {account.userId}</p>
        </div>
        <div className="detail-actions">
          <button className="icon-button" title="Set default" onClick={onSetDefault} disabled={busy || account.isDefault}>
            <Star size={18} />
          </button>
          <button className="icon-button" title="Edit label" onClick={onEdit} disabled={busy}>
            <Pencil size={18} />
          </button>
          <button className="icon-button danger" title="Delete account" onClick={onDelete} disabled={busy}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="detail-status-row">
        <StatusPill status={snapshot?.status ?? 'unknown'} />
        {tokenPlanLabel ? (
          <span className={`source-pill token-plan ${snapshot?.tokenPlan?.expired ? 'expired' : ''}`}>{tokenPlanLabel}</span>
        ) : null}
        {hasApiBalance ? (
          <span className="source-pill api-key">API Balance</span>
        ) : null}
        {snapshot && !tokenPlanLabel && !hasApiBalance ? <span>No quota data</span> : null}
        {!snapshot ? <span>No usage snapshot yet</span> : null}
        <span>{account.isDefault ? 'Default account' : 'Secondary account'}</span>
      </div>

      {account.lastError ? <div className="error-banner">{account.lastError}</div> : null}

      {snapshot ? (
        <>
          {hasApiBalance && snapshot.balance ? <BalanceOverview balance={snapshot.balance} /> : null}
          <TokenUsageSection snapshot={snapshot} />
        </>
      ) : (
        <div className="empty-detail inline">
          <CircleAlert size={28} />
          <h3>No usage saved</h3>
          <p>Refresh this account after login to fetch token plan usage and API key balance data.</p>
        </div>
      )}
      <ApiKeysSection
        apiKeys={apiKeys}
        busy={busy}
        onAdd={onAddApiKey}
        onCopy={onCopyApiKey}
        onDelete={onDeleteApiKey}
      />
    </>
  );
}

function BalanceOverview({ balance }: { balance: NonNullable<UsageSnapshot['balance']> }): React.ReactElement {
  const available = balanceAvailable(balance);

  return (
    <section className="quota-overview">
      <div className="quota-overview-main">
        <div>
          <div className="eyebrow">API Key Balance</div>
          <h3>Account Balance</h3>
        </div>
        <strong>{formatMoney(balance.balance, balance.currency)}</strong>
      </div>
      <div className="quota-metrics">
        <QuotaMetric label="Available" value={formatMoney(available, balance.currency)} />
        <QuotaMetric label="Cash" value={formatMoney(balance.cashBalance, balance.currency)} />
        <QuotaMetric label="Gift" value={formatMoney(balance.giftBalance, balance.currency)} />
        <QuotaMetric label="Frozen" value={formatMoney(balance.frozenBalance, balance.currency)} />
        <QuotaMetric
          label="Credit"
          value={`${formatMoney(balance.remainingOverdraftLimit, balance.currency)} / ${formatMoney(balance.overdraftLimit, balance.currency)}`}
        />
      </div>
    </section>
  );
}

function ApiKeysSection({
  apiKeys,
  busy,
  onAdd,
  onCopy,
  onDelete
}: {
  apiKeys: ApiKeyRef[];
  busy: boolean;
  onAdd: () => void;
  onCopy: (apiKey: ApiKeyRef) => void;
  onDelete: (apiKey: ApiKeyRef) => void;
}): React.ReactElement {
  return (
    <section className="api-keys-section">
      <div className="section-title-row">
        <div>
          <div className="eyebrow">Local API Keys</div>
          <h3>API Keys</h3>
        </div>
        <button className="button secondary compact" onClick={onAdd} disabled={busy}>
          <Plus size={16} />
          Add Key
        </button>
      </div>
      {apiKeys.length === 0 ? (
        <p className="muted">No API keys saved locally.</p>
      ) : (
        <div className="api-key-list">
          {apiKeys.map((apiKey) => (
            <div className="api-key-row" key={apiKey.id}>
              <div className="api-key-main">
                <KeyRound size={18} />
                <div>
                  <strong>{apiKey.label || 'API Key'}</strong>
                  <code>{apiKey.maskedKey}</code>
                  <span>{apiKey.lastCopiedAt ? `Last copied ${shortTime(apiKey.lastCopiedAt)}` : 'Not copied yet'}</span>
                </div>
              </div>
              <div className="api-key-actions">
                <button className="button secondary compact" onClick={() => onCopy(apiKey)} disabled={busy}>
                  <Copy size={15} />
                  Copy
                </button>
                <button className="icon-button danger" title="Delete API key" onClick={() => onDelete(apiKey)} disabled={busy}>
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function QuotaMetric({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="quota-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface DisplayBucket {
  key: string;
  label: string;
  bucket: TokenBucket;
}

function TokenUsageSection({ snapshot }: { snapshot: UsageSnapshot }): React.ReactElement {
  const visibleBuckets = tokenUsageBuckets(snapshot);

  return (
    <section className="usage-section">
      <h3>Token Plan Usage</h3>
      {visibleBuckets.length === 0 ? (
        <p className="muted">No buckets returned.</p>
      ) : (
        visibleBuckets.map(({ key, label, bucket }) => (
          <div className="bucket-row" key={key}>
            <div className="bucket-header">
              <span title={bucketHelp(bucket.name)}>{label}</span>
              <strong>{bucket.percent}%</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(bucket.percent, 100)}%` }} />
            </div>
            <div className="bucket-meta">
              <span>
                {formatCompactNumber(bucket.used)} / {bucket.limit > 0 ? formatCompactNumber(bucket.limit) : 'unlimited'}
              </span>
              <span>{bucket.limit > 0 ? `${formatNumber(bucket.remaining)} remaining` : 'no limit'}</span>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function LabelDialog({
  account,
  busy,
  onCancel,
  onSubmit
}: {
  account: Account;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (account: Account, label: string) => Promise<void>;
}): React.ReactElement {
  const [label, setLabel] = useState(account.label || '');

  return (
    <Dialog title="Edit Label" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(account, label);
        }}
      >
        <label>
          Label
          <input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <DialogActions busy={busy} onCancel={onCancel} submitLabel="Save Label" />
      </form>
    </Dialog>
  );
}

function ApiKeyDialog({
  account,
  busy,
  onCancel,
  onSubmit
}: {
  account: Account;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (account: Account, label: string, apiKey: string) => Promise<void>;
}): React.ReactElement {
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');

  return (
    <Dialog title="Add API Key" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(account, label, apiKey);
        }}
      >
        <label>
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Optional" />
        </label>
        <label>
          API Key
          <input
            autoFocus
            autoComplete="off"
            spellCheck={false}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="mimo_sk_..."
          />
        </label>
        <DialogActions busy={busy} onCancel={onCancel} submitLabel="Save API Key" submitDisabled={!apiKey.trim()} />
      </form>
    </Dialog>
  );
}

function ConfirmDeleteDialog({
  account,
  busy,
  onCancel,
  onConfirm
}: {
  account: Account;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (account: Account) => Promise<void>;
}): React.ReactElement {
  return (
    <Dialog title="Delete Account" onCancel={onCancel}>
      <p>
        Delete <strong>{account.name}</strong> from local metadata and remove its cookie from Keychain?
      </p>
      <div className="dialog-actions">
        <button className="button secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="button danger" onClick={() => void onConfirm(account)} disabled={busy}>
          <Trash2 size={17} />
          Delete
        </button>
      </div>
    </Dialog>
  );
}

function ConfirmDeleteApiKeyDialog({
  account,
  apiKey,
  busy,
  onCancel,
  onConfirm
}: {
  account: Account;
  apiKey: ApiKeyRef;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (account: Account, apiKey: ApiKeyRef) => Promise<void>;
}): React.ReactElement {
  return (
    <Dialog title="Delete API Key" onCancel={onCancel}>
      <p>
        Delete <strong>{apiKey.label || apiKey.maskedKey}</strong> from local metadata and remove the secret from Keychain?
      </p>
      <div className="dialog-actions">
        <button className="button secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="button danger" onClick={() => void onConfirm(account, apiKey)} disabled={busy}>
          <Trash2 size={17} />
          Delete
        </button>
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  children,
  onCancel
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h2>{title}</h2>
          <button className="close-button" onClick={onCancel} aria-label="Close dialog">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function DialogActions({
  busy,
  onCancel,
  submitLabel,
  submitDisabled = false
}: {
  busy: boolean;
  onCancel: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
}): React.ReactElement {
  return (
    <div className="dialog-actions">
      <button type="button" className="button secondary" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      <button type="submit" className="button primary" disabled={busy || submitDisabled}>
        {submitLabel}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: UsageStatus | 'unknown' }): React.ReactElement {
  const icon = status === 'ok' ? <CircleCheck size={14} /> : <CircleAlert size={14} />;
  return (
    <span className={`status-pill ${statusClass(status)}`}>
      {icon}
      {status}
    </span>
  );
}

function resolveTokenPlanLabel(snapshot: UsageSnapshot): string | undefined {
  const detail = snapshot.tokenPlan;
  const planLabel = detail?.planCode ? planCodeLabel(detail.planCode) : undefined;
  const fallbackLabel = detail?.planName || (snapshot.quotaSummary.limit > 0 ? 'Token Plan' : undefined);
  const label = planLabel || fallbackLabel;

  if (!label) {
    return undefined;
  }

  return detail?.expired ? `Expired ${label}` : label;
}

function planCodeLabel(planCode: string): string {
  const normalized = planCode.trim().toLowerCase().replace(/[:\s-]+/g, '_');
  const annual = normalized.endsWith('_year') || normalized.includes('annual');
  const base = normalized.replace(/_?year$/, '').replace(/_?annual$/, '');
  const known: Record<string, string> = {
    lite: 'Lite',
    standard: 'Standard',
    pro: 'Pro',
    max: 'Max',
    trial: 'Trial',
    free: 'Free'
  };
  const label =
    known[base] ??
    base
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  return annual && label ? `${label} Annual` : label || 'Token Plan';
}

function shouldShowBucket(bucket: TokenBucket): boolean {
  return !(bucket.name === 'compensation_total_token' && bucket.limit === 0);
}

function tokenUsageBuckets(snapshot: UsageSnapshot): DisplayBucket[] {
  const monthBuckets = snapshot.monthUsage.filter(shouldShowBucket);
  const planBuckets = snapshot.planUsage.filter(shouldShowBucket);
  const monthTotal = monthBuckets.find((bucket) => bucket.name === 'month_total_token');
  const planTotal = planBuckets.find((bucket) => bucket.name === 'plan_total_token');
  const consumed = new Set<TokenBucket>();
  const rows: DisplayBucket[] = [];

  if (monthTotal && planTotal && isSameQuotaBucket(monthTotal, planTotal)) {
    rows.push({
      key: 'token_plan_total',
      label: 'Token plan total',
      bucket: bucketWithBestPercent(monthTotal, planTotal)
    });
    consumed.add(monthTotal);
    consumed.add(planTotal);
  }

  for (const bucket of monthBuckets) {
    if (!consumed.has(bucket)) {
      rows.push({ key: `month:${bucket.name}`, label: bucketLabel(bucket.name), bucket });
    }
  }

  for (const bucket of planBuckets) {
    if (!consumed.has(bucket)) {
      rows.push({ key: `plan:${bucket.name}`, label: bucketLabel(bucket.name), bucket });
    }
  }

  return rows;
}

function isSameQuotaBucket(left: TokenBucket, right: TokenBucket): boolean {
  return left.used === right.used && left.limit === right.limit && left.remaining === right.remaining;
}

function bucketWithBestPercent(left: TokenBucket, right: TokenBucket): TokenBucket {
  return {
    ...right,
    percent: Math.max(left.percent, right.percent)
  };
}

function bucketLabel(name: string): string {
  switch (name) {
    case 'month_total_token':
      return 'Monthly total';
    case 'plan_total_token':
      return 'Plan total';
    case 'compensation_total_token':
      return 'Compensation credits';
    default:
      return name;
  }
}

function bucketHelp(name: string): string | undefined {
  if (name === 'compensation_total_token') {
    return 'Extra credits granted by MiMo when plan changes create a price difference.';
  }
  return undefined;
}

function balanceAvailable(balance: NonNullable<UsageSnapshot['balance']>): number {
  return Math.max(balance.balance, 0) + Math.max(balance.remainingOverdraftLimit, 0);
}

function formatMoney(value: number, currency = 'CNY'): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(value);
  return `${currency} ${formatted}`;
}

function filterAccounts(accounts: Account[], query: string): Account[] {
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

function summarize(config: AppConfig): { accounts: number; ok: number; warn: number; needsAttention: number } {
  const snapshots = Object.values(config.snapshots);
  return {
    accounts: config.accounts.length,
    ok: snapshots.filter((snapshot) => snapshot.status === 'ok').length,
    warn: snapshots.filter((snapshot) => snapshot.status === 'warn').length,
    needsAttention: snapshots.filter(
      (snapshot) => snapshot.status === 'critical' || snapshot.status === 'stale' || snapshot.status === 'login required'
    ).length
  };
}

function statusClass(status: UsageStatus | 'unknown'): string {
  return status.replace(/\s+/g, '-');
}

function shortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function createEmptyRendererConfig(): AppConfig {
  return {
    version: 1,
    accounts: [],
    apiKeys: [],
    settings: {
      refreshIntervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
      warnPercent: DEFAULT_WARN_PERCENT,
      criticalPercent: DEFAULT_CRITICAL_PERCENT
    },
    snapshots: {}
  };
}
