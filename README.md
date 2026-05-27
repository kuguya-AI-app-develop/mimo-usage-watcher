# MiMo Plan Watcher

Desktop GUI for monitoring Xiaomi MiMo token-plan usage across multiple accounts.

## Development

```sh
pnpm install
pnpm dev
```

`pnpm dev` launches the Electron GUI. The Login & Import button opens MiMo's
console balance entry in a separate Electron login window, which redirects to
the Xiaomi Account login page for `sid=api-platform`. After login succeeds, the
app collects the MiMo platform cookies from that isolated Electron session,
validates them against the usage API, auto-names the account from `userId`, and
stores the account metadata locally.

The Browser Login button opens the same MiMo login entry in your default
browser so you can use Chrome/Safari password management. Browser cookies are
not readable by the app, so importing from the default browser still requires
Paste Cookie.

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

The GUI also supports manual cookie import for default-browser login,
recovery, and testing.
