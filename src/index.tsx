#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { ConfigStore } from './config.js';
import { AccountService } from './accounts.js';
import { renderDashboardSnapshot } from './tui/snapshot.js';
import { App } from './tui/App.js';

const program = new Command();

program
  .name('mimo-watcher')
  .description('TUI dashboard for Xiaomi MiMo token-plan usage')
  .option('--data-dir <path>', 'override data directory')
  .option('--snapshot', 'print a static dashboard snapshot and exit')
  .action(async (options: { dataDir?: string; snapshot?: boolean }) => {
    const configStore = new ConfigStore(options.dataDir);
    const service = new AccountService({ configStore });

    if (options.snapshot) {
      const config = await service.load();
      console.log(renderDashboardSnapshot(config));
      return;
    }

    render(<App service={service} />);
  });

await program.parseAsync(process.argv);
