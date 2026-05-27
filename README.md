# MiMo Plan Watcher

Desktop GUI for monitoring Xiaomi MiMo token-plan usage across multiple accounts.

## Development

```sh
pnpm install
pnpm dev
```

`pnpm dev` launches the Electron GUI. The Login Account button opens a separate
Xiaomi MiMo login window directly. After login succeeds, the app collects the
MiMo platform cookies from that isolated Electron session, validates them
against the usage API, auto-names the account from `userId`, and stores the
account metadata locally.

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

The GUI also supports manual cookie import for recovery/testing, but browser
login is the primary path.
