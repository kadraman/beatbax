import { Command } from 'commander';
import { playFile } from '@beatbax/engine/node';
import { version as cliVersion } from './version.js';

const program = new Command();

program
  .name('beatbax-dev')
  .description('Development CLI for BeatBax')
  .version(cliVersion);

program
  .command('play')
  .argument('<file>')
  .option('--headless', 'Use Node.js audio playback')
  .option('--browser', 'Use browser-based playback')
  .action(async (file, options) => {
    await playFile(file, {
      noBrowser: options.headless === true,
      browser: options.browser === true
    });
  });

program.parse();
