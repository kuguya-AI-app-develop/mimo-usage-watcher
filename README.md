# MiMo Plan Watcher

Desktop GUI for monitoring Xiaomi MiMo token-plan usage across multiple accounts.

## Development

```sh
pnpm install
pnpm dev
```

`pnpm dev` launches the Electron GUI. The header keeps a single Refresh action
for refreshing all saved accounts. Login & Import is available from the account
panel; it opens MiMo's console balance entry in a separate Electron login
window, which redirects to the Xiaomi Account login page for `sid=api-platform`.
After login succeeds, the app captures MiMo platform cookies from the Electron
session and platform request headers, validates them against the usage and
balance APIs, loads token plan detail from `/api/v1/tokenPlan/detail`,
auto-names the account from `userId`, and stores the account metadata locally.

## Storage

- Sensitive cookie headers are stored in macOS Keychain under the
  `xiaomi-mimo-watcher` service.
- Non-sensitive metadata and usage snapshots are stored in
  `~/.mimo-watcher/config.json`.
- Electron browser login state is stored under `~/.mimo-watcher/electron`.

The app does not read Chrome or Safari profiles and does not store Xiaomi
account passwords.

## Commands

```sh
pnpm dev          # Electron GUI
pnpm build        # TypeScript + renderer production build
pnpm start        # Run the built Electron GUI
pnpm test
pnpm typecheck
pnpm dev:tui      # Legacy terminal UI
```

The dashboard refreshes saved accounts automatically every
`refreshIntervalSeconds` seconds, in addition to the manual Refresh button. It
shows token-plan usage from `/api/v1/tokenPlan/usage` and API key account
balance from `/api/v1/balance` side by side, because the two quota mechanisms
can both be available on the same account. Empty zero-limit compensation buckets
are hidden, while non-zero compensation credits are labeled separately.
