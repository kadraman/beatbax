import { Command } from 'commander';
import { playFile } from '@beatbax/engine';

const program = new Command();

program
  .name('beatbax-dev')
  .description('Development CLI for BeatBax')
  .version('0.1.0');

program
  .command('play')
  .argument('<file>')
  .action(async (file) => {
    await playFile(file);
  });

program.parse();
