import { Command, Argument } from 'commander';
import { playFile, readUGEFile, getUGESummary } from '@beatbax/engine';
import * as engineImports from '@beatbax/engine/import';
import { exportJSON, exportMIDI, exportUGE, exportWAVFromSong } from '@beatbax/engine/export';
import { configureLogging } from '@beatbax/engine/util/logger';
import { readFileSync, statSync, existsSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { parse } from '@beatbax/engine/parser';
import { resolveSongAsync, resolveImports } from '@beatbax/engine/song';

const { getUGEDetailedJSON } = engineImports as any;

interface SourceLocation {
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
}

type ValidationIssue = { message: string; loc?: SourceLocation; component?: string };
type ValidationResult = { errors: ValidationIssue[]; warnings: ValidationIssue[]; ast: any };

/**
 * Configure logger based on CLI flags.
 * Call this at the start of each command action.
 */
function configureLoggerFromCLI(options: any, globalOpts: any) {
  const verbose = options?.verbose === true || globalOpts?.verbose === true;
  const debug = globalOpts?.debug === true;

  if (debug) {
    configureLogging({ level: 'debug' });
  } else if (verbose) {
    configureLogging({ level: 'info' });
  } else {
    configureLogging({ level: 'error' });
  }
}

function formatLocation(loc?: SourceLocation): string {
  if (!loc || !loc.start) return '';
  const line = loc.start.line;
  const col = loc.start.column || 0;
  return ` (line ${line}, column ${col})`;
}

function ensureFileExists(file: string) {
  if (!existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exit(1);
  }
}

async function validateSource(src: string, filename?: string): Promise<ValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Pre-scan for empty `seq NAME =` lines — treat as errors.
  const seqEmptyRe = /^\s*seq\s+([A-Za-z_][A-Za-z0-9_\-]*)\s*=\s*$/gm;
  let mm: RegExpExecArray | null;
  while ((mm = seqEmptyRe.exec(src)) !== null) {
    errors.push({
      message: `Sequence '${mm[1]}' has no RHS content (empty). ` +
        `Define patterns after '=' or remove the empty 'seq ${mm[1]} =' line.`
    });
  }

  let ast: any;
  try {
    ast = parse(src);
  } catch (parseErr: any) {
    const formattedError = filename ? formatParseError(parseErr, filename) : extractErrorMessage(parseErr);
    errors.push({ message: formattedError });
    return { errors, warnings, ast: null as any };
  }

  // Resolve imports if present (separate try/catch to provide better error messages)
  // Use async resolver to support remote imports
  if (ast.imports && ast.imports.length > 0 && filename) {
    try {
      // Convert filename to absolute path for proper import resolution
      const absoluteFilePath = resolvePath(filename);
      ast = await resolveImports(ast, {
        baseFilePath: absoluteFilePath,
        searchPaths: [process.cwd()],
        onWarn: (message, loc) => {
          warnings.push({ message, loc, component: 'import-resolver' });
        },
      });
    } catch (importErr: any) {
      errors.push({ message: `Import error: ${extractErrorMessage(importErr)}` });
      return { errors, warnings, ast: null as any };
    }
  }

  // Validate channels and instruments
  for (const ch of ast.channels || []) {
    if (ch.inst && !ast.insts[ch.inst]) {
      errors.push({ message: `Channel ${ch.id} references unknown inst '${ch.inst}'`, loc: ch.loc });
    }
    // collect sequence base names referenced by channel
    const extractSeqBaseNames = (ch2: any): string[] => {
      const names: string[] = [];
      if (!ch2 || !ch2.pat) return names;

      // If parser attached raw seqSpecTokens (space-preserved), prefer them
      // even if ch.pat is already expanded to an array
      const rawTokens: string[] | undefined = (ch2 as any).seqSpecTokens;
      if (rawTokens && rawTokens.length > 0) {
        const joined = rawTokens.join(' ');
        for (const group of joined.split(',')) {
          const g = group.trim();
          if (!g) continue;
          if (g.indexOf('*') >= 0) {
            const m = g.match(/^(.+?)\s*\*\s*(\d+)$/);
            const itemRef = m ? m[1].trim() : g;
            const base = itemRef.split(':')[0];
            if (base) names.push(base);
          } else {
            const parts = g.split(/\s+/).map(s => s.trim()).filter(Boolean);
            for (const p of parts) names.push(p.split(':')[0]);
          }
        }
        return names.filter(Boolean);
      }

      // ch.pat is inline tokens (array), no external sequence names
      if (Array.isArray(ch2.pat)) {
        return [];
      }

      // Fallback: ch.pat is a string like "lead" or "lead*2" or "lead,lead2"
      const spec = String(ch2.pat).trim();
      for (const group of spec.split(',')) {
        const g = group.trim();
        if (!g) continue;
        const mRep = g.match(/^(.+?)\s*\*\s*(\d+)$/);
        const itemRef = mRep ? mRep[1].trim() : g;
        const base = itemRef.split(':')[0];
        if (base) names.push(base);
      }
      return names.filter(Boolean);
    };

    const bases = extractSeqBaseNames(ch);
    for (const baseSeqName of bases) {
      if (!ast.seqs || !ast.seqs[baseSeqName]) {
        // Check if it's actually a pattern name (common mistake)
        if (ast.pats && ast.pats[baseSeqName]) {
          warnings.push({
            message: `Channel ${ch.id} references '${baseSeqName}' as a sequence, but it's a pattern. Create a sequence first: 'seq myseq = ${baseSeqName}' or use comma-separated patterns with channel directive.`,
            loc: ch.loc
          });
        } else {
          warnings.push({ message: `Channel ${ch.id} references unknown sequence '${baseSeqName}'`, loc: ch.loc });
        }
      }
    }
  }

  // Validate patterns
  for (const [name, pat] of Object.entries(ast.pats || {})) {
    if (!Array.isArray(pat) || (pat as any[]).length === 0) {
      errors.push({ message: `Pattern '${name}' is empty or malformed` });
    }
  }

  // Validate sequences reference valid patterns
  if (ast.seqs) {
    for (const [seqName, patRefs] of Object.entries(ast.seqs)) {
      if (!Array.isArray(patRefs) || (patRefs as any[]).length === 0) {
        errors.push({ message: `Sequence '${seqName}' is empty or malformed` });
      } else {
        for (const patRef of patRefs as any[]) {
          let basePatName = typeof patRef === 'string' ? patRef.split(':')[0] : patRef;
          if (typeof basePatName === 'string') {
            const mRep = basePatName.match(/^(.+?)\*(\d+)$/);
            if (mRep) basePatName = mRep[1];
            if (!ast.pats[basePatName]) {
              warnings.push({ message: `Sequence '${seqName}' references unknown pattern '${basePatName}'` });
            }
          }
        }
      }
    }
  }

  return { errors, warnings, ast };
}

// Helper to consistently extract an error message string from thrown errors.
function extractErrorMessage(err: any, preferStack = false): string {
  if (!err) return String(err);
  if (preferStack && err && (err as any).stack) return String((err as any).stack);
  if (err && (err as any).message) return String((err as any).message);
  try { return String(err); } catch (_) { return '[unserializable error]'; }
}

// Helper to format parse errors with file location information
function formatParseError(err: any, filename: string): string {
  if (!err) return `Error parsing ${filename}: Unknown error`;

  const message = err.message || String(err);

  // Check if this is a Peggy parser error with location information
  if (err.location && err.location.start) {
    const line = err.location.start.line;
    const column = err.location.start.column;
    return `Error parsing ${filename} at line ${line}, column ${column}: ${message}`;
  }

  // Fallback for other errors
  return `Error parsing ${filename}: ${message}`;
}

const program = new Command();

program
  .name('beatbax')
  .description('Live-coding language for retro console chiptunes')
  .version('0.1.0');

// Global options
program
  .option('-v, --verbose', 'Enable verbose output for all commands')
  .option('-D, --debug', 'Enable debug output (print stack traces)')
  .option('--strict', 'Fail on warnings (non-zero exit)')
  .option('-r, --sample-rate <hz>', 'Sample rate for audio operations (playback/export)', '44100');

program
  .command('play')
  .description('Play a song file (.bax). Defaults to headless playback in Node.js.')
  .argument('<file>', 'Path to the .bax song file')
  .option('-b, --browser', 'Launch browser-based playback (opens web UI)')
  .option('--headless', 'Force headless Node.js playback (default in Node)')
  .option('--no-browser', 'Force headless Node.js playback (alias for --headless)')
  .option('--backend <name>', 'Audio backend: auto (default), node-webaudio, browser', 'auto')
  .option('--buffer-frames <n>', 'Buffer length in frames for offline rendering (optional)', '4096')
  .option('-v, --verbose', 'Enable verbose output (show parsed AST)')
  .action(async (file, options) => {
    const globalOpts = program.opts();

    // Configure logger based on CLI flags
    configureLoggerFromCLI(options, globalOpts);

    const verbose = options.verbose === true || (globalOpts && globalOpts.verbose === true);
    // Read and validate before starting playback to avoid playing invalid files.
    ensureFileExists(file);
    const src = readFileSync(file, 'utf8');
    const { errors, warnings } = await validateSource(src, file);
    if (errors.length > 0) {
      console.error(`Validation failed for ${file}:`);
      for (const e of errors) console.error('  -', e.message + formatLocation(e.loc));
      process.exitCode = 2;
      return;
    }
    if (warnings.length > 0) {
      console.log(`\n⚠️  Warnings`);
      for (const w of warnings) console.log(`  [${w.component || 'validation'}] ${w.message}${formatLocation(w.loc)}`);
      console.log('');
    }

    await playFile(file, {
      browser: options.browser === true,
      noBrowser: (options.browser !== true) || options.headless === true || options.backend === 'node-webaudio',
      backend: options.backend,
      sampleRate: parseInt(globalOpts.sampleRate, 10),
      bufferFrames: options.bufferFrames ? parseInt(options.bufferFrames, 10) : undefined,
      verbose: verbose
    });
  });

program
  .command('verify')
  .description('Parse and validate a song file; exit 0 if valid, non-zero if invalid')
  .argument('<file>', 'Path to the .bax song file')
  .action(async (file) => {
    const globalOpts = program.opts();

    // Configure logger based on CLI flags
    configureLoggerFromCLI({}, globalOpts);

    const verbose = globalOpts && globalOpts.verbose === true;
    ensureFileExists(file);
    const src = readFileSync(file, 'utf8');

    if (verbose) {
      console.log(`Verifying: ${file}`);
      console.log('  Parsing source...');
    }

    // Use validateSource which handles import resolution (now async)
    const { errors, warnings, ast } = await validateSource(src, file);

    if (verbose && ast) {
      console.log('  Source parsed successfully');
      console.log(`  AST structure (after import resolution):`);
      console.log(`    - Patterns: ${Object.keys(ast.pats || {}).length}`);
      console.log(`    - Sequences: ${Object.keys(ast.seqs || {}).length}`);
      console.log(`    - Instruments: ${Object.keys(ast.insts || {}).length}`);
      console.log(`    - Channels: ${(ast.channels || []).length}`);
      if (ast.bpm) console.log(`    - Tempo: ${ast.bpm} BPM`);
      console.log('  Running resolver...');
    }

    if (errors.length > 0) {
      console.error(`Validation failed for ${file}:`);
      for (const e of errors) {
        console.error('  -', e);
      }
      process.exitCode = 2;
      return;
    }

    // Run the resolver to materialize sequences/channels and collect any
    // resolver warnings (e.g. arrange expansion issues).
    const resolverWarnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];
    try {
      await resolveSongAsync(ast, {
        filename: file,
        searchPaths: [process.cwd()],
        onWarn: (d: any) => resolverWarnings.push(d)
      } as any);
    } catch (resErr: any) {
      console.error('Resolver error:', extractErrorMessage(resErr, globalOpts && globalOpts.debug));
      process.exitCode = 2;
      return;
    }

    // Merge parser warnings and resolver warnings
    const allWarnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];
    for (const w of warnings) {
      allWarnings.push({ component: w.component || 'validation', message: w.message, loc: w.loc });
    }
    allWarnings.push(...resolverWarnings);

    if (allWarnings.length > 0) {
      console.log(`\n⚠️  Warnings`);
      for (const w of allWarnings) {
        console.log(`  [${w.component}] ${w.message}${formatLocation(w.loc)}`);
      }
      console.log('');
      if (globalOpts && globalOpts.strict) {
        console.error('Strict mode enabled: failing due to warnings');
        process.exitCode = 2;
        return;
      }
    }

    if (verbose) {
      console.log('Verification complete: All checks passed');
    }
    console.log(`OK: ${file} parsed and validated`);
    process.exitCode = 0;
  });

program
  .command('export')
  .description('Export a song to various formats (JSON, MIDI, UGE, WAV)')
  .addArgument(new Argument('<format>', 'Target format').choices(['json', 'midi', 'uge', 'wav']))
  .argument('<file>', 'Path to the .bax song file')
  .argument('[output]', 'Output file path (optional)')
  .option('-o, --out <path>', 'Output file path (overrides default)')
  .option('-d, --duration <seconds>', 'Duration for rendering in seconds (WAV and MIDI only)')
  .option('-c, --channels <channels>', 'Comma-separated list of channels to render, e.g., "1,2" (WAV and MIDI only)')
  .option('-b, --bit-depth <depth>', 'Bit depth for WAV export (16, 24, 32)', '16')
  .option('--normalize', 'Normalize audio peak to 0.95 (WAV only)', false)
  .option('--strict-gb', 'Fail export when numeric pan values are present (strict Game Boy compatibility)', false)
  .action(async (format, file, output, options) => {
    ensureFileExists(file);
    const globalOpts = program.opts();

    // Configure logger based on CLI flags
    configureLoggerFromCLI(options, globalOpts);

    const verbose = (globalOpts && globalOpts.verbose === true) || false;
    const src = readFileSync(file, 'utf8');
    const { errors, warnings, ast } = await validateSource(src, file);
    if (errors.length > 0) {
      console.error(`Validation failed for ${file}:`);
      for (const e of errors) console.error('  -', e.message + formatLocation(e.loc));
      process.exitCode = 2;
      return;
    }
    // Collect resolver warnings during export so we can honor --strict globally
    const resolverWarnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];
    // `song` will be populated by the resolver below; declare it in the outer
    // scope so it is available after the try/catch for export steps.
    let song: any = undefined;
    try {
      const resolved = await resolveSongAsync(ast, {
        filename: file,
        searchPaths: [process.cwd()],
        onWarn: (d: any) => resolverWarnings.push(d)
      } as any);

      // Merge parser warnings and resolver warnings
      const allWarnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];
      for (const w of warnings) {
        allWarnings.push({ component: w.component || 'validation', message: w.message, loc: w.loc });
      }
      allWarnings.push(...resolverWarnings);

      if (allWarnings.length > 0) {
        console.log(`\n⚠️  Warnings`);
        for (const w of allWarnings) {
          console.log(`  [${w.component}] ${w.message}${formatLocation(w.loc)}`);
        }
        console.log('');
      }
      if (allWarnings.length > 0 && program.opts() && program.opts().strict) {
        console.error('Strict mode enabled: failing due to warnings');
        process.exitCode = 2;
        return;
      }
      song = resolved;
    } catch (resErr: any) {
      const globalOpts = program.opts();
      console.error('Resolver error:', extractErrorMessage(resErr, globalOpts && globalOpts.debug));
      process.exitCode = 2;
      return;
    }

    let outPath = output || options.out;

    // If no output path provided, generate one based on input filename and format
    if (!outPath) {
      const ext = format === 'json' ? '.json' : (format === 'midi' ? '.mid' : (format === 'uge' ? '.uge' : '.wav'));
      outPath = file.replace(/\.[^/.]+$/, "") + ext;
    }

    const channels = options.channels
      ? options.channels.split(',').map((c: string) => parseInt(c.trim(), 10))
      : undefined;

    if (channels) {
      const chip = ast.chip?.toLowerCase() || 'gameboy';

      if (chip === 'gameboy') {
        for (const c of channels) {
          if (isNaN(c) || c < 1 || c > 4) {
            console.error(`Error: Invalid channel number '${c}' for chip 'gameboy'. Channels must be between 1 and 4.`);
            process.exit(1);
          }
        }
      }
      /*
      else if (chip === 'nes') {
        // NES has 5 channels: Pulse 1, Pulse 2, Triangle, Noise, DMC
        for (const c of channels) {
          if (isNaN(c) || c < 1 || c > 5) {
            console.error(`Error: Invalid channel number '${c}' for chip 'nes'. Channels must be between 1 and 5.`);
            process.exit(1);
          }
        }
      }
      else if (chip === 'sid') {
        // C64 SID has 3 channels
        for (const c of channels) {
          if (isNaN(c) || c < 1 || c > 3) {
            console.error(`Error: Invalid channel number '${c}' for chip 'sid'. Channels must be between 1 and 3.`);
            process.exit(1);
          }
        }
      }
      */
      else {
        // For unknown chips, we skip validation or use a generic check
        if (verbose) console.warn(`[WARN] Skipping channel validation for unknown chip: ${chip}`);
      }
    }

    const duration = options.duration ? parseFloat(options.duration) : undefined;
    const bitDepth = options.bitDepth ? parseInt(options.bitDepth, 10) : 16;

    if (![16, 24, 32].includes(bitDepth)) {
      console.error(`Error: Invalid bit depth '${bitDepth}'. Allowed values are 16, 24, or 32.`);
      process.exit(1);
    }

    if (format === 'json') await exportJSON(song, outPath, { debug: globalOpts && globalOpts.debug === true, verbose: globalOpts && globalOpts.verbose === true });
    else if (format === 'midi') await exportMIDI(song, outPath, { duration, channels }, { debug: globalOpts && globalOpts.debug === true, verbose: globalOpts && globalOpts.verbose === true });
    else if (format === 'uge') await exportUGE(song, outPath, { debug: globalOpts && globalOpts.debug === true, verbose: globalOpts && globalOpts.verbose === true, strictGb: Boolean((options as any).strictGb) });
    else if (format === 'wav') {
      await exportWAVFromSong(song, outPath, {
        duration,
        renderChannels: channels,
        sampleRate: globalOpts.sampleRate ? parseInt(globalOpts.sampleRate, 10) : 44100,
        bitDepth: bitDepth as 16 | 24 | 32,
        normalize: options.normalize === true
      }, { debug: globalOpts && globalOpts.debug === true, verbose: globalOpts && globalOpts.verbose === true });
    }
    else {
      console.error('Unknown export format:', format);
      process.exitCode = 2;
      return;
    }

    const stats = statSync(outPath);
    let debugInfo = '';
    if (globalOpts && globalOpts.debug) {
      if (format === 'wav') {
        const sr = globalOpts.sampleRate ? parseInt(globalOpts.sampleRate, 10) : 44100;
        debugInfo = ` [DEBUG: ${sr}Hz, ${bitDepth}-bit, 2ch]`;
      } else if (format === 'midi') {
        debugInfo = ` [DEBUG: ${song.channels.length} tracks]`;
      } else if (format === 'uge') {
        debugInfo = ` [DEBUG: v6]`;
      } else if (format === 'json') {
        debugInfo = ` [DEBUG: v1]`;
      }
    }
    console.log(`[OK] Exported ${format.toUpperCase()} file: ${outPath} (${stats.size} bytes)${debugInfo}`);
  });

program
  .command('inspect')
  .description('Inspect a .bax or .uge file and print its structure or metadata')
  .argument('<file>', 'Path to the .bax or .uge file')
  .option('-j, --json', 'Output detailed JSON (default is summary)')
  .action(async (file, options) => {
    const globalOpts = program.opts();

    // Configure logger based on CLI flags
    configureLoggerFromCLI(options, globalOpts);

    try {
      ensureFileExists(file);
      if (file.endsWith('.uge')) {
        const uge = readUGEFile(file);
        if (options.json) {
          console.log(getUGEDetailedJSON(uge));
        } else {
          const summary = getUGESummary(uge);
          console.log(summary);
        }
      } else {
        const src = readFileSync(file, 'utf8');
        const ast = parse(src);
        if (options.json) {
          console.log(JSON.stringify(ast, null, 2));
        } else {
          // Print summary for .bax files
          const chip = ast.chip || 'gameboy';
          const bpm = ast.bpm || 120;
          const patterns = Object.keys(ast.pats || {}).length;
          const sequences = Object.keys(ast.seqs || {}).length;
          const instruments = Object.keys(ast.insts || {}).length;
          const channels = (ast.channels || []).length;

          console.log(`=== BeatBax Song ===`);
          console.log(`Chip: ${chip}`);
          console.log(`Tempo: ${bpm} BPM`);
          console.log(`Patterns: ${patterns}`);
          console.log(`Sequences: ${sequences}`);
          console.log(`Instruments: ${instruments}`);
          console.log(`Channels: ${channels}`);

          const metadata = (ast as any).metadata;
          if (metadata) {
            console.log(`\nMetadata:`);
            if (metadata.name) console.log(`  Name: ${metadata.name}`);
            if (metadata.artist) console.log(`  Artist: ${metadata.artist}`);
            if (metadata.description) console.log(`  Description: ${metadata.description}`);
            if (metadata.tags) console.log(`  Tags: ${metadata.tags.join(', ')}`);
          }
        }
      }
    } catch (err: any) {
      const globalOpts = program.opts();
      console.error('Failed to inspect file:', extractErrorMessage(err, globalOpts && globalOpts.debug));
      process.exitCode = 2;
    }
  });

program.parse();
