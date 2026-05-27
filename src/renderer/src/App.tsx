import React, { useEffect, useMemo, useState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  ClipboardPaste,
  LogIn,
  Pencil,
  RefreshCw,
  Search,
  Star,
  Trash2
} from 'lucide-react';
import type { Account, AppConfig, TokenBucket, UsageSnapshot, UsageStatus } from '../../types.js';
import {
  DEFAULT_CRITICAL_PERCENT,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  DEFAULT_WARN_PERCENT
} from '../../constants.js';
import { formatCompactNumber, formatNumber } from '../../utils/format.js';
import { unwrap } from './api.js';

type DialogMode =
  | { type: 'paste-cookie' }
  | { type: 'edit-label'; account: Account }
  | { type: 'delete'; account: Account }
  | null;

export function App(): React.ReactElement {
  const [config, setConfig] = useState<AppConfig>(createEmptyRendererConfig());
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading local account data...');

  const accounts = useMemo(() => filterAccounts(config.accounts, query), [config.accounts, query]);
  const selected = accounts.find((account) => account.id === selectedId) ?? accounts[0];
  const selectedSnapshot = selected ? config.snapshots[selected.id] : undefined;
  const summary = useMemo(() => summarize(config), [config]);

  useEffect(() => {
    void run(async () => {
      const next = await unwrap(await window.mimo.load());
      setConfig(next);
      setSelectedId(next.settings.defaultAccountId ?? next.accounts[0]?.id);
      setStatus(next.accounts.length ? 'Ready. Refresh to update token usage.' : 'No accounts yet. Add a MiMo account to begin.');
    }, false);
  }, []);

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

  async function refreshAll(): Promise<void> {
    await run(async () => {
      setStatus('Refreshing all accounts...');
      const next = await unwrap(await window.mimo.refreshAll());
      setConfig(next);
      setStatus(`Refreshed ${next.accounts.length} account${next.accounts.length === 1 ? '' : 's'}.`);
    });
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

  async function pasteCookie(input: { name: string; label?: string; cookieHeader: string }): Promise<void> {
    await run(async () => {
      const next = await unwrap(await window.mimo.addFromCookie(input));
      setConfig(next);
      const account = next.accounts.find((candidate) => candidate.name === input.name);
      setSelectedId(account?.id ?? next.settings.defaultAccountId);
      setDialog(null);
      setStatus(`Saved ${input.name} from pasted cookie.`);
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Xiaomi MiMo</div>
          <h1>Plan Watcher</h1>
        </div>
        <div className="topbar-actions">
          <button className="button secondary" onClick={refreshAll} disabled={busy || config.accounts.length === 0}>
            <RefreshCw size={17} />
            Refresh
          </button>
          <button className="button secondary" onClick={() => setDialog({ type: 'paste-cookie' })} disabled={busy}>
            <ClipboardPaste size={17} />
            Paste Cookie
          </button>
          <button className="button primary" onClick={() => void login()} disabled={busy}>
            <LogIn size={17} />
            Login Account
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
            <h2>Accounts</h2>
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
                  Login Account
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
              busy={busy}
              onSetDefault={() => void setDefault(selected)}
              onEdit={() => setDialog({ type: 'edit-label', account: selected })}
              onDelete={() => setDialog({ type: 'delete', account: selected })}
            />
          ) : (
            <div className="empty-detail">
              <CircleCheck size={30} />
              <h2>No account selected</h2>
              <p>Use Login Account to add a Xiaomi MiMo account and fetch its token plan usage.</p>
            </div>
          )}
        </section>
      </section>

      <footer className="statusbar">
        <span className={busy ? 'pulse-dot active' : 'pulse-dot'} />
        <span>{status}</span>
      </footer>

      {dialog?.type === 'paste-cookie' ? (
        <PasteCookieDialog busy={busy} onCancel={() => setDialog(null)} onSubmit={pasteCookie} />
      ) : null}
      {dialog?.type === 'edit-label' ? (
        <LabelDialog account={dialog.account} busy={busy} onCancel={() => setDialog(null)} onSubmit={saveLabel} />
      ) : null}
      {dialog?.type === 'delete' ? (
        <ConfirmDeleteDialog account={dialog.account} busy={busy} onCancel={() => setDialog(null)} onConfirm={deleteAccount} />
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
  busy,
  onSetDefault,
  onEdit,
  onDelete
}: {
  account: Account;
  snapshot?: UsageSnapshot;
  busy: boolean;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): React.ReactElement {
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
        <span>{snapshot ? `${snapshot.overallPercent}% overall usage` : 'No usage snapshot yet'}</span>
        <span>{account.isDefault ? 'Default account' : 'Secondary account'}</span>
      </div>

      {account.lastError ? <div className="error-banner">{account.lastError}</div> : null}

      {snapshot ? (
        <div className="usage-grid">
          <UsageSection title="Month Usage" buckets={snapshot.monthUsage} />
          <UsageSection title="Plan Usage" buckets={snapshot.planUsage} />
        </div>
      ) : (
        <div className="empty-detail inline">
          <CircleAlert size={28} />
          <h3>No token usage saved</h3>
          <p>Refresh this account after login to fetch the latest MiMo token plan data.</p>
        </div>
      )}
    </>
  );
}

function UsageSection({ title, buckets }: { title: string; buckets: TokenBucket[] }): React.ReactElement {
  return (
    <section className="usage-section">
      <h3>{title}</h3>
      {buckets.length === 0 ? (
        <p className="muted">No buckets returned.</p>
      ) : (
        buckets.map((bucket) => (
          <div className="bucket-row" key={bucket.name}>
            <div className="bucket-header">
              <span>{bucket.name}</span>
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

function PasteCookieDialog({
  busy,
  onCancel,
  onSubmit
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { name: string; label?: string; cookieHeader: string }) => Promise<void>;
}): React.ReactElement {
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [cookieHeader, setCookieHeader] = useState('');

  return (
    <Dialog title="Paste Cookie" onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit({ name, label, cookieHeader });
        }}
      >
        <label>
          Account name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="main" />
        </label>
        <label>
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Optional display label" />
        </label>
        <label>
          Cookie header
          <textarea value={cookieHeader} onChange={(event) => setCookieHeader(event.target.value)} rows={5} />
        </label>
        <DialogActions busy={busy} onCancel={onCancel} submitLabel="Save Cookie" submitDisabled={!name.trim() || !cookieHeader.trim()} />
      </form>
    </Dialog>
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
    settings: {
      refreshIntervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
      warnPercent: DEFAULT_WARN_PERCENT,
      criticalPercent: DEFAULT_CRITICAL_PERCENT
    },
    snapshots: {}
  };
}
