import { spawn } from 'node:child_process';
import { once } from 'node:events';
import electronPath from 'electron';
import { createServer } from 'vite';

const server = await createServer({
  configFile: 'vite.config.ts',
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});

await server.listen();
const rendererUrl = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5173/';

const tsc = spawn('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

const [code] = (await once(tsc, 'exit')) as [number];
if (code !== 0) {
  await server.close();
  process.exit(code);
}

const electron = spawn(String(electronPath), ['dist/electron/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MIMO_WATCHER_RENDERER_URL: rendererUrl
  }
});

const shutdown = async () => {
  electron.kill();
  await server.close();
};

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

const [electronCode] = (await once(electron, 'exit')) as [number | null];
await server.close();
process.exit(electronCode ?? 0);
