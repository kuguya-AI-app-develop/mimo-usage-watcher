# MiMo Usage Watcher

Desktop GUI for monitoring Xiaomi MiMo token-plan usage and API key balance across multiple accounts.

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

- Sensitive cookie headers and manually saved API keys are stored in macOS Keychain under the
  `xiaomi-mimo-watcher` service.
- Non-sensitive metadata and usage snapshots are stored in
  `~/.mimo-watcher/config.json`.
- Electron browser login state is stored under `~/.mimo-watcher/electron`.

The app does not read Chrome or Safari profiles and does not store Xiaomi
account passwords. Full API keys are never written to `config.json`; only their
labels and masked values are saved there.

## Commands

```sh
pnpm dev          # Electron GUI
pnpm build        # TypeScript + renderer production build
pnpm start        # Run the built Electron GUI
pnpm dist:mac     # Build an unsigned macOS DMG under release/
pnpm test
pnpm typecheck
pnpm dev:tui      # Legacy terminal UI
```

The package is named `mimo-usage-watcher`; the legacy `mimo-watcher` bin is
kept as an alias.

The dashboard refreshes saved accounts automatically every
`refreshIntervalSeconds` seconds, in addition to the manual Refresh button. It
shows token-plan usage from `/api/v1/tokenPlan/usage` and API key account
balance from `/api/v1/balance` side by side, because the two quota mechanisms
can both be available on the same account. Empty zero-limit compensation buckets
are hidden, while non-zero compensation credits are labeled separately.

## Releases

Pushing to `main` runs `.github/workflows/release-dmg.yml`, builds a macOS DMG,
and attaches it to a GitHub release named from the package version and workflow
run number.
