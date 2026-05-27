import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { Account, AppConfig } from '../types.js';
import { createEmptyConfig } from '../config.js';
import { AccountService } from '../accounts.js';
import { formatBucket, progressBar, statusLabel } from '../utils/format.js';
import { filterAccounts } from './snapshot.js';

type Mode =
  | { name: 'normal' }
  | { name: 'help' }
  | { name: 'detail' }
  | { name: 'search'; input: string }
  | { name: 'login-name'; input: string }
  | { name: 'login-label'; accountName: string; input: string }
  | { name: 'paste-name'; input: string }
  | { name: 'paste-label'; accountName: string; input: string }
  | { name: 'paste-cookie'; accountName: string; label: string; input: string }
  | { name: 'edit-label'; accountId: string; input: string }
  | { name: 'delete-confirm'; accountId: string };

export interface AppProps {
  dataDir?: string;
  service?: AccountService;
}

export function App({ service: providedService }: AppProps): React.ReactElement {
  const serviceRef = useRef<AccountService>(providedService ?? new AccountService());
  const service = serviceRef.current;
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [config, setConfig] = useState<AppConfig>(createEmptyConfig());
  const [mode, setMode] = useState<Mode>({ name: 'normal' });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusLine, setStatusLine] = useState('Loading...');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const accounts = useMemo(() => filterAccounts(config.accounts, searchQuery), [config.accounts, searchQuery]);
  const selected = accounts[selectedIndex] ?? accounts[0];
  const rows = stdout.rows || 30;

  const refreshAll = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setStatusLine('Refreshing usage...');
    try {
      const next = await service.refreshAll();
      setConfig(next);
      setStatusLine(`Refreshed ${next.accounts.length} account(s).`);
    } catch (error) {
      setStatusLine(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [service]);

  useEffect(() => {
    let cancelled = false;
    void service
      .load()
      .then((next) => {
        if (cancelled) {
          return;
        }
        setConfig(next);
        setSelectedIndex((current) => clampIndex(current, next.accounts.length));
        setStatusLine(next.accounts.length > 0 ? 'Ready. Press r to refresh.' : 'No accounts yet.');
        if (next.accounts.length > 0) {
          void refreshAll();
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setStatusLine(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshAll, service]);

  useEffect(() => {
    const intervalMs = Math.max(config.settings.refreshIntervalSeconds, 5) * 1000;
    const timer = setInterval(() => {
      if (config.accounts.length > 0) {
        void refreshAll();
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [config.accounts.length, config.settings.refreshIntervalSeconds, refreshAll]);

  useInput((input, key) => {
    if (busy && mode.name === 'normal' && input !== 'q' && !(key.ctrl && input === 'c')) {
      return;
    }

    if (busy && mode.name !== 'normal') {
      return;
    }

    if (mode.name !== 'normal' && mode.name !== 'help' && mode.name !== 'detail') {
      handleInputMode(input, key);
      return;
    }

    if (mode.name === 'help' || mode.name === 'detail') {
      if (key.escape || input === 'q' || input === '?' || input === 'i') {
        setMode({ name: 'normal' });
        setStatusLine('Ready.');
      }
      return;
    }

    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    switch (input) {
      case 'q':
        exit();
        break;
      case '?':
        setMode({ name: 'help' });
        break;
      case 'i':
        if (selected) {
          setMode({ name: 'detail' });
        }
        break;
      case '/':
        setMode({ name: 'search', input: searchQuery });
        break;
      case 'a':
        setMode({ name: 'login-name', input: '' });
        setStatusLine('Enter account name.');
        break;
      case 'p':
        setMode({ name: 'paste-name', input: '' });
        setStatusLine('Enter account name.');
        break;
      case 'r':
        void refreshAll();
        break;
      case 'u':
        if (selected) {
          void runAction(async () => {
            const next = await service.setDefault(selected.id);
            setConfig(next);
            setStatusLine(`Default account set to ${selected.name}.`);
          });
        }
        break;
      case 'e':
        if (selected) {
          setMode({ name: 'edit-label', accountId: selected.id, input: selected.label || '' });
          setStatusLine('Edit label.');
        }
        break;
      case 'd':
        if (selected) {
          setMode({ name: 'delete-confirm', accountId: selected.id });
          setStatusLine(`Delete ${selected.name}? Press y to confirm.`);
        }
        break;
      case 'j':
        setSelectedIndex((current) => clampIndex(current + 1, accounts.length));
        break;
      case 'k':
        setSelectedIndex((current) => clampIndex(current - 1, accounts.length));
        break;
      default:
        if (key.downArrow) {
          setSelectedIndex((current) => clampIndex(current + 1, accounts.length));
        } else if (key.upArrow) {
          setSelectedIndex((current) => clampIndex(current - 1, accounts.length));
        }
    }
  });

  const handleInputMode = (input: string, key: { return?: boolean; escape?: boolean; backspace?: boolean; delete?: boolean }) => {
    if (key.escape) {
      setMode({ name: 'normal' });
      setStatusLine('Cancelled.');
      return;
    }

    if (mode.name === 'delete-confirm') {
      if (input.toLowerCase() === 'y') {
        void runAction(async () => {
          const account = config.accounts.find((candidate) => candidate.id === mode.accountId);
          const next = await service.remove(mode.accountId);
          setConfig(next);
          setSelectedIndex((current) => clampIndex(current, next.accounts.length));
          setMode({ name: 'normal' });
          setStatusLine(`Deleted ${account?.name || mode.accountId}.`);
        });
      } else if (input.toLowerCase() === 'n' || input === 'q') {
        setMode({ name: 'normal' });
        setStatusLine('Delete cancelled.');
      }
      return;
    }

    if (key.return) {
      submitMode();
      return;
    }

    if (key.backspace || key.delete) {
      updateModeInput((value) => value.slice(0, -1));
      return;
    }

    if (input) {
      updateModeInput((value) => value + input);
    }
  };

  const submitMode = () => {
    switch (mode.name) {
      case 'search':
        setSearchQuery(mode.input);
        setSelectedIndex(0);
        setMode({ name: 'normal' });
        setStatusLine(mode.input ? `Search: ${mode.input}` : 'Search cleared.');
        break;
      case 'login-name':
        if (!mode.input.trim()) {
          setStatusLine('Account name is required.');
          return;
        }
        setMode({ name: 'login-label', accountName: mode.input.trim(), input: '' });
        setStatusLine('Enter label, or press Enter to skip.');
        break;
      case 'login-label':
        void runAction(async () => {
          setStatusLine('Waiting for browser login...');
          const next = await service.addOrUpdateFromBrowserLogin({
            name: mode.accountName,
            label: mode.input,
            onStatus: setStatusLine
          });
          setConfig(next);
          setMode({ name: 'normal' });
          setStatusLine(`Added ${mode.accountName}.`);
        });
        break;
      case 'paste-name':
        if (!mode.input.trim()) {
          setStatusLine('Account name is required.');
          return;
        }
        setMode({ name: 'paste-label', accountName: mode.input.trim(), input: '' });
        setStatusLine('Enter label, or press Enter to skip.');
        break;
      case 'paste-label':
        setMode({ name: 'paste-cookie', accountName: mode.accountName, label: mode.input, input: '' });
        setStatusLine('Paste cookie header, then press Enter.');
        break;
      case 'paste-cookie':
        void runAction(async () => {
          const next = await service.addOrUpdateFromCookie({
            name: mode.accountName,
            label: mode.label,
            cookieHeader: mode.input
          });
          setConfig(next);
          setMode({ name: 'normal' });
          setStatusLine(`Added ${mode.accountName}.`);
        });
        break;
      case 'edit-label':
        void runAction(async () => {
          const next = await service.renameLabel(mode.accountId, mode.input);
          setConfig(next);
          setMode({ name: 'normal' });
          setStatusLine('Label updated.');
        });
        break;
      default:
        break;
    }
  };

  const updateModeInput = (updater: (value: string) => string) => {
    setMode((current) => {
      if (!('input' in current)) {
        return current;
      }
      return { ...current, input: updater(current.input) } as Mode;
    });
  };

  const runAction = async (action: () => Promise<void>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setStatusLine(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Box flexDirection="column" minHeight={Math.max(rows - 1, 20)}>
      <Header config={config} busy={busy} />
      <Box flexDirection="row" flexGrow={1} gap={2}>
        <AccountList accounts={accounts} snapshots={config.snapshots} selectedIndex={selectedIndex} />
        <DetailPanel selected={selected} config={config} mode={mode} />
      </Box>
      <Footer mode={mode} statusLine={statusLine} />
    </Box>
  );
}

function Header({ config, busy }: { config: AppConfig; busy: boolean }): React.ReactElement {
  const snapshots = Object.values(config.snapshots);
  const critical = snapshots.filter((snapshot) => snapshot.status === 'critical').length;
  const warn = snapshots.filter((snapshot) => snapshot.status === 'warn').length;
  const stale = snapshots.filter((snapshot) => snapshot.status === 'stale' || snapshot.status === 'login required').length;
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>Xiaomi MiMo Watcher</Text>
      <Text>
        Accounts: {config.accounts.length} | Critical: {critical} | Warn: {warn} | Needs attention: {stale}
        {busy ? ' | Busy' : ''}
      </Text>
    </Box>
  );
}

function AccountList({
  accounts,
  snapshots,
  selectedIndex
}: {
  accounts: Account[];
  snapshots: AppConfig['snapshots'];
  selectedIndex: number;
}): React.ReactElement {
  return (
    <Box flexDirection="column" width="55%" borderStyle="single" paddingX={1}>
      <Text bold>Accounts</Text>
      {accounts.length === 0 ? (
        <Text color="gray">No accounts yet. Press a to login or p to paste a cookie.</Text>
      ) : (
        accounts.map((account, index) => {
          const snapshot = snapshots[account.id];
          const selected = index === selectedIndex;
          const percent = snapshot?.overallPercent ?? 0;
          const status = snapshot?.status ?? 'unknown';
          return (
            <Text key={account.id} inverse={selected} color={colorForStatus(status)}>
              {selected ? '>' : ' '} {account.isDefault ? '*' : ' '} {account.name}
              {account.label ? ` (${account.label})` : ''} {progressBar(percent, 10)} {percent}% {statusLabel(status)}
            </Text>
          );
        })
      )}
    </Box>
  );
}

function DetailPanel({
  selected,
  config,
  mode
}: {
  selected?: Account;
  config: AppConfig;
  mode: Mode;
}): React.ReactElement {
  if (mode.name === 'help') {
    return <HelpPanel />;
  }

  if (mode.name !== 'normal' && mode.name !== 'detail') {
    return <InputPanel mode={mode} />;
  }

  if (!selected) {
    return (
      <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
        <Text bold>Details</Text>
        <Text color="gray">No account selected.</Text>
      </Box>
    );
  }

  const snapshot = config.snapshots[selected.id];
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
      <Text bold>Details</Text>
      <Text>Name: {selected.name}</Text>
      <Text>Label: {selected.label || '-'}</Text>
      <Text>User ID: {selected.userId}</Text>
      <Text>Default: {selected.isDefault ? 'yes' : 'no'}</Text>
      <Text>Last refresh: {selected.lastRefreshAt || '-'}</Text>
      {selected.lastError ? <Text color="red">Last error: {selected.lastError}</Text> : null}
      {snapshot ? (
        <>
          <Text color={colorForStatus(snapshot.status)}>
            Status: {statusLabel(snapshot.status)} ({snapshot.overallPercent}%)
          </Text>
          <Text bold>Month usage</Text>
          {snapshot.monthUsage.length === 0 ? <Text color="gray">-</Text> : snapshot.monthUsage.map((bucket) => <Text key={`m-${bucket.name}`}>{formatBucket(bucket)}</Text>)}
          <Text bold>Plan usage</Text>
          {snapshot.planUsage.length === 0 ? <Text color="gray">-</Text> : snapshot.planUsage.map((bucket) => <Text key={`p-${bucket.name}`}>{formatBucket(bucket)}</Text>)}
        </>
      ) : (
        <Text color="gray">No usage snapshot.</Text>
      )}
    </Box>
  );
}

function InputPanel({ mode }: { mode: Mode }): React.ReactElement {
  let title = 'Input';
  let value = 'input' in mode ? mode.input : '';
  let hint = 'Enter to submit, Esc to cancel';

  if (mode.name === 'login-name' || mode.name === 'paste-name') {
    title = 'Account name';
  } else if (mode.name === 'login-label' || mode.name === 'paste-label' || mode.name === 'edit-label') {
    title = 'Label';
  } else if (mode.name === 'paste-cookie') {
    title = 'Cookie header';
    value = value ? `[${value.length} characters hidden]` : '';
    hint = 'Cookie input is hidden. Enter to save, Esc to cancel.';
  } else if (mode.name === 'search') {
    title = 'Search';
  } else if (mode.name === 'delete-confirm') {
    title = 'Confirm delete';
    value = 'Press y to delete, n to cancel.';
    hint = '';
  }

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
      <Text bold>{title}</Text>
      <Text>{value || ' '}</Text>
      <Text color="gray">{hint}</Text>
    </Box>
  );
}

function HelpPanel(): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" paddingX={1}>
      <Text bold>Help</Text>
      <Text>a browser login add</Text>
      <Text>p paste cookie add</Text>
      <Text>r refresh usage</Text>
      <Text>u set selected as default</Text>
      <Text>e edit label</Text>
      <Text>d delete account</Text>
      <Text>/ search</Text>
      <Text>i details</Text>
      <Text>j/k or arrows move</Text>
      <Text>q quit</Text>
    </Box>
  );
}

function Footer({ mode, statusLine }: { mode: Mode; statusLine: string }): React.ReactElement {
  const help =
    mode.name === 'normal'
      ? 'a login | p paste | r refresh | u default | e label | d delete | / search | ? help | q quit'
      : 'Enter submit | Esc cancel';
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text>{statusLine}</Text>
      <Text color="gray">{help}</Text>
    </Box>
  );
}

function colorForStatus(status: string): 'green' | 'yellow' | 'red' | 'gray' | undefined {
  switch (status) {
    case 'ok':
      return 'green';
    case 'warn':
      return 'yellow';
    case 'critical':
    case 'login required':
      return 'red';
    case 'stale':
    case 'unknown':
      return 'gray';
    default:
      return undefined;
  }
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, length - 1));
}
