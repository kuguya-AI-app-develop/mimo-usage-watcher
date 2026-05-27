# Xiaomi MiMo Watcher

Terminal UI for monitoring token-plan usage across multiple Xiaomi MiMo accounts.

## Development

```sh
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

The default command opens a TUI dashboard. Account cookies are stored in the
macOS Keychain under the `xiaomi-mimo-watcher` service. Non-sensitive metadata
and usage snapshots are stored in `~/.mimo-watcher/config.json`.

If Google Chrome is already installed, browser login can use it as a fallback.
Installing Playwright's Chromium keeps the login flow independent of your normal
browser profiles.

## Commands

```sh
pnpm dev
pnpm build
pnpm test
```

Inside the TUI:

- `a`: add an account through a controlled browser login
- `p`: paste a cookie manually
- `r`: refresh usage
- `u`: mark selected account as default
- `e`: edit label
- `d`: delete account
- `/`: search
- `i`: details
- `?`: help
- `q`: quit

The tool never reads existing Chrome or Safari profiles and does not store
Xiaomi account passwords.
