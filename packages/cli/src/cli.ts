import { Command } from 'commander';
import { playFile } from '@beatbax/engine';
import { exportJSON, exportMIDI, exportUGE } from '@beatbax/engine/export';
import { readFileSync } from 'fs';
import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song/resolver';

const program = new Command();

program
  .name('beatbax')
  .description('Live-coding language for retro console chiptunes')
  .version('0.1.0');

program
  .command('play')
  .argument('<file>')
  .action(async (file) => {
    await playFile(file);
  });

program
  .command('verify')
  .argument('<file>')
  .description('Parse and validate a song file; exit 0 if valid, non-zero if invalid')
  .action(async (file) => {
    try {
      const src = readFileSync(file, 'utf8');
      const ast = parse(src);
      const errors: string[] = [];

      for (const ch of ast.channels) {
        if (ch.inst && !ast.insts[ch.inst]) {
          errors.push(`Channel ${ch.id} references unknown inst '${ch.inst}'`);
        }
        if (typeof ch.pat === 'string') {
          errors.push(`Channel ${ch.id} references unknown pattern '${ch.pat}'`);
        }
      }

      for (const [name, pat] of Object.entries(ast.pats)) {
        if (!Array.isArray(pat) || pat.length === 0) {
          errors.push(`Pattern '${name}' is empty or malformed`);
        }
      }

      if (errors.length === 0) {
        console.log(`OK: ${file} parsed and basic validation passed`);
        process.exitCode = 0;
      } else {
        console.error(`Validation failed for ${file}:`);
        for (const e of errors) console.error('  -', e);
        process.exitCode = 2;
      }
    } catch (err: any) {
      console.error('Error parsing file:', err && err.message ? err.message : err);
      process.exitCode = 2;
    }
  });

program
  .command('export')
  .argument('<format>', 'json | midi | uge')
  .argument('<file>')
  .option('-o, --out <path>', 'Output file path (overrides default)')
  .action(async (format, file, options) => {
    const src = readFileSync(file, 'utf8');
    const ast = parse(src);
    const song = resolveSong(ast);

    let outPath = (typeof options === 'string') ? options : (options && options.out ? options.out : file);
    if (!outPath || outPath === file) {
      try {
        const argv = process.argv.slice(2);
        const fileIndex = argv.findIndex(a => a === file || a === file.replace(/\\/g, '/'));
        if (fileIndex >= 0 && fileIndex + 1 < argv.length) {
          const candidate = argv[fileIndex + 1];
          if (candidate && !candidate.startsWith('-')) outPath = candidate;
        }
      } catch (_) {}
    }

    if (format === 'json') await exportJSON(song, outPath);
    else if (format === 'midi') await exportMIDI(song, outPath);
    else if (format === 'uge') await exportUGE(song, outPath);
    else {
      console.error('Unknown export format:', format);
      process.exitCode = 2;
    }
  });

program.parse();
