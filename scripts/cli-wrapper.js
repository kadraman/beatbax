#!/usr/bin/env node
/**
 * Wrapper script to ensure CLI arguments are passed correctly through npm.
 * This works around npm's argument passing issues with chained commands.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, '../packages/cli/dist/cli.js');

// Pass all arguments to the CLI
const args = process.argv.slice(2);
const child = spawn('node', [cliPath, ...args], {
  stdio: 'inherit',
  shell: false
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
