import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { getDefaultDataDir } from '../config.js';
import { createGuiAccountService, registerIpcHandlers } from './ipc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = getDefaultDataDir();
const service = createGuiAccountService(dataDir);
let mainWindow: BrowserWindow | null = null;
const electronUserDataDir = join(dataDir, 'electron');

app.setName('MiMo Usage Watcher');
mkdirSync(electronUserDataDir, { recursive: true, mode: 0o700 });
app.setPath('userData', electronUserDataDir);

registerIpcHandlers(service, () => mainWindow);

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: 'MiMo Usage Watcher',
    backgroundColor: '#f6f7f9',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devUrl = process.env.MIMO_WATCHER_RENDERER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
