import { Command } from 'commander';
import { playFile, readUGEFile, getUGESummary } from '@beatbax/engine';
import { exportJSON, exportMIDI, exportUGE, exportWAVFromSong } from '@beatbax/engine/export';
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
  .description('Play a song file (.bax) using browser or headless backends')
  .argument('<file>', 'Path to the .bax song file')
  .option('-b, --browser', 'Launch browser-based playback (opens web UI)')
  .option('--headless', 'Force headless Node.js playback (no browser window)')
  .option('--backend <name>', 'Audio backend: auto (default), node-webaudio, browser', 'auto')
  .option('--sample-rate <hz>', 'Sample rate for headless context', '44100')
  .option('-v, --verbose', 'Enable verbose output (show parsed AST)')
  .action(async (file, options) => {
    await playFile(file, {
      browser: options.browser === true,
      noBrowser: options.headless === true || options.backend === 'node-webaudio',
      backend: options.backend,
      sampleRate: parseInt(options.sampleRate, 10),
      verbose: options.verbose === true
    });
  });

program
  .command('verify')
  .description('Parse and validate a song file; exit 0 if valid, non-zero if invalid')
  .argument('<file>', 'Path to the .bax song file')
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
          // Extract base sequence name (before any transforms like :oct(-1))
          const baseSeqName = ch.pat.split(':')[0];
          if (!ast.seqs || !ast.seqs[baseSeqName]) {
            errors.push(`Channel ${ch.id} references unknown sequence '${baseSeqName}'`);
          }
        }
      }

      for (const [name, pat] of Object.entries(ast.pats)) {
        if (!Array.isArray(pat) || pat.length === 0) {
          errors.push(`Pattern '${name}' is empty or malformed`);
        }
      }

      // Validate sequences reference valid patterns
      if (ast.seqs) {
        for (const [seqName, patRefs] of Object.entries(ast.seqs)) {
          if (!Array.isArray(patRefs) || patRefs.length === 0) {
            errors.push(`Sequence '${seqName}' is empty or malformed`);
          } else {
            for (const patRef of patRefs) {
              const basePatName = typeof patRef === 'string' ? patRef.split(':')[0] : patRef;
              if (typeof basePatName === 'string' && !ast.pats[basePatName]) {
                errors.push(`Sequence '${seqName}' references unknown pattern '${basePatName}'`);
              }
            }
          }
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
  .description('Export a song to various formats (JSON, MIDI, UGE, WAV)')
  .argument('<format>', 'Target format: json | midi | uge | wav')
  .argument('<file>', 'Path to the .bax song file')
  .argument('[output]', 'Output file path (optional)')
  .option('-o, --out <path>', 'Output file path (overrides default)')
  .option('--duration <seconds>', 'Duration for rendering in seconds (WAV and MIDI only)')
  .option('--channels <channels>', 'Comma-separated list of channels to render (1-4), e.g., "1,2" (WAV and MIDI only)')
  .action(async (format, file, output, options) => {
    const src = readFileSync(file, 'utf8');
    const ast = parse(src);
    const song = resolveSong(ast);

    let outPath = output || options.out;
    
    // If no output path provided, generate one based on input filename and format
    if (!outPath) {
      const ext = format === 'json' ? '.json' : (format === 'midi' ? '.mid' : (format === 'uge' ? '.uge' : '.wav'));
      outPath = file.replace(/\.[^/.]+$/, "") + ext;
    }

    const channels = options.channels 
      ? options.channels.split(',').map((c: string) => parseInt(c.trim(), 10))
      : undefined;
    const duration = options.duration ? parseFloat(options.duration) : undefined;

    if (format === 'json') await exportJSON(song, outPath);
    else if (format === 'midi') await exportMIDI(song, outPath, { duration, channels });
    else if (format === 'uge') await exportUGE(song, outPath);
    else if (format === 'wav') {
      await exportWAVFromSong(song, outPath, {
        duration,
        renderChannels: channels
      });
    }
    else {
      console.error('Unknown export format:', format);
      process.exitCode = 2;
    }
  });

program
  .command('inspect')
  .description('Inspect a .bax or .uge file and print its structure or metadata')
  .argument('<file>', 'Path to the .bax or .uge file')
  .action(async (file) => {
    try {
      if (file.endsWith('.uge')) {
        const uge = readUGEFile(file);
        const summary = getUGESummary(uge);
        console.log(summary);
      } else {
        const src = readFileSync(file, 'utf8');
        const ast = parse(src);
        console.log(JSON.stringify(ast, null, 2));
      }
    } catch (err: any) {
      console.error('Failed to inspect file:', err && err.message ? err.message : err);
      process.exitCode = 2;
    }
  });

program.parse();
