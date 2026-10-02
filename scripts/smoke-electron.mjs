import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

// Exercise the actual production entry point without user data, login or Keychain.
const dataDir = mkdtempSync(join(os.tmpdir(), 'mimo-electron-smoke-'));
process.env.MIMO_WATCHER_DATA_DIR = dataDir;
delete process.env.MIMO_WATCHER_RENDERER_URL;
BrowserWindow.prototype.show = function () {};
const errors = [];
const timeout = setTimeout(() => finish(new Error('Electron smoke test timed out')), 15000);

function finish(error) {
  clearTimeout(timeout);
  if (error) {
    console.error(error);
  } else {
    console.log('Electron smoke passed: .mjs preload, isolated bridge, empty account page and IPC load.');
  }
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  rmSync(dataDir, { recursive: true, force: true });
  app.exit(error ? 1 : 0);
}

app.on('browser-window-created', (_event, window) => {
  window.webContents.on('preload-error', (_event, _path, error) => errors.push(error));
  window.webContents.once('did-finish-load', () => {
    void (async () => {
      const preferences = window.webContents.getLastWebPreferences();
      const mainSource = readFileSync(new URL('../dist/electron/main.js', import.meta.url), 'utf8');
      assert.match(mainSource, /preload:\s*join\(__dirname,\s*['"]preload\.mjs['"]\)/);
      assert.ok(existsSync(new URL('../dist/electron/preload.mjs', import.meta.url)));
      assert.equal(preferences.nodeIntegration, false);
      assert.equal(preferences.contextIsolation, true);
      const result = await window.webContents.executeJavaScript(`(async () => {
        const bridge = typeof window.mimo?.load;
        const response = await window.mimo.load();
        for (let attempt = 0; attempt < 100 && document.body.textContent.includes('Loading local account data'); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return { bridge, response, text: document.body.textContent };
      })()`);
      assert.equal(errors.length, 0, errors.map(String).join('\n'));
      assert.equal(result.bridge, 'function');
      assert.equal(result.response.ok, true);
      assert.deepEqual(result.response.data.accounts, []);
      assert.match(result.text, /No accounts yet/);
      finish();
    })().catch(finish);
  });
});

try {
  await import('../dist/electron/main.js');
} catch (error) {
  finish(error);
}
