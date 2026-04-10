import { Command, Argument } from 'commander';
import { playFile, readUGEFile, getUGESummary, chipRegistry, BeatBaxEngine } from '@beatbax/engine';
import type { ChipPlugin } from '@beatbax/engine';
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

  let ast: any;
  try {
    ast = parse(src);
  } catch (parseErr: any) {
    const formattedError = filename ? formatParseError(parseErr, filename) : extractErrorMessage(parseErr);
    errors.push({ message: formattedError });
    return { errors, warnings, ast: null as any };
  }

  // Resolve imports BEFORE promoting diagnostics so that instruments/sequences
  // introduced by imports are visible when we decide which diagnostics are real.
  if (ast.imports && ast.imports.length > 0 && filename) {
    try {
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

  // Promote parser diagnostics into errors/warnings AFTER import resolution.
  // Filter out instrument-reference diagnostics for names that are now defined
  // in the resolved AST (i.e. they were supplied by an import).
  const resolvedInsts: Record<string, unknown> = ast.insts ?? {};
  for (const d of (ast.diagnostics ?? [])) {
    // Suppress instrument-reference issues that are resolved post-import.
    const instMatch = typeof d.message === 'string'
      ? d.message.match(/instrument '([^']+)' is not defined/)
      : null;
    if (instMatch && resolvedInsts[instMatch[1]]) continue;

    const issue: ValidationIssue = { message: d.message, loc: d.loc, component: d.component };
    if (d.level === 'error') errors.push(issue); else warnings.push(issue);
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
        console.error('  -', e.message + formatLocation(e.loc));
      }
      if (warnings.length > 0) {
        console.error(`\n  Warnings:`);
        for (const w of warnings) {
          console.error('  -', `[${w.component || 'validation'}] ${w.message}${formatLocation(w.loc)}`);
        }
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

// ─── Plugin auto-discovery ────────────────────────────────────────────────────

/**
 * Auto-discover and register BeatBax chip plugins from the local node_modules.
 *
 * Searches for npm packages whose name matches `@beatbax/plugin-chip-*` and
 * `beatbax-plugin-chip-*` patterns. Each discovered package is loaded as a
 * dynamic ESM import; if it exports a default `ChipPlugin` object with a
 * `name` string, it is registered with the global `chipRegistry`.
 *
 * Discovery happens synchronously at CLI startup and is intentionally
 * fire-and-forget for non-critical errors (e.g. a malformed plugin will not
 * crash the CLI — it prints a warning and skips registration).
 */
async function discoverPlugins(options: { verbose?: boolean } = {}): Promise<ChipPlugin[]> {
  const discovered: ChipPlugin[] = [];
  const { createRequire } = await import('module');
  const req = createRequire(import.meta.url);

  // Collect candidate package names from node_modules
  const candidates: string[] = [];
  try {
    const { readdirSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const cliDir = dirname(fileURLToPath(import.meta.url));

    // Walk up to find node_modules
    const searchPaths = [
      join(cliDir, '..', '..', 'node_modules'),         // packages/node_modules
      join(cliDir, '..', '..', '..', 'node_modules'),   // root node_modules
      join(process.cwd(), 'node_modules'),               // cwd node_modules
    ];

    for (const nmDir of searchPaths) {
      try {
        const entries = readdirSync(nmDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          // Scoped packages (e.g. @beatbax/plugin-chip-nes)
          if (entry.name === '@beatbax') {
            const scopedEntries = readdirSync(join(nmDir, '@beatbax'), { withFileTypes: true });
            for (const scoped of scopedEntries) {
              if (scoped.isDirectory() && scoped.name.startsWith('plugin-chip-')) {
                candidates.push(`@beatbax/${scoped.name}`);
              }
            }
          }
          // Unscoped community plugins (e.g. beatbax-plugin-chip-sid)
          if (entry.name.startsWith('beatbax-plugin-chip-')) {
            candidates.push(entry.name);
          }
        }
      } catch (_) {
        // node_modules dir doesn't exist here — skip
      }
    }
  } catch (_) {
    // Filesystem scan failed — continue without auto-discovery
  }

  // Remove duplicates
  const unique = [...new Set(candidates)];

  for (const pkgName of unique) {
    // Skip the built-in Game Boy plugin if it ever gets published as a
    // standalone package — it is always pre-registered by ChipRegistry.
    if (pkgName === '@beatbax/plugin-chip-gameboy') continue;
    try {
      const mod = await import(pkgName);
      const plugin: ChipPlugin = mod.default || mod;

      if (typeof plugin?.name !== 'string' || typeof plugin?.createChannel !== 'function') {
        if (options.verbose) {
          console.warn(`[WARN] Skipping '${pkgName}': missing required ChipPlugin fields (name, createChannel)`);
        }
        continue;
      }

      if (!chipRegistry.has(plugin.name)) {
        chipRegistry.register(plugin);
        discovered.push(plugin);
        if (options.verbose) {
          console.log(`[plugin] Loaded chip plugin: '${plugin.name}' from ${pkgName} v${plugin.version}`);
        }
      }
    } catch (err: any) {
      if (options.verbose) {
        console.warn(`[WARN] Failed to load chip plugin '${pkgName}':`, err.message);
      }
    }
  }

  return discovered;
}

program
  .command('list-chips')
  .description('List all available chip backends (built-in and plugin-discovered)')
  .option('--json', 'Output JSON format')
  .action(async (options) => {
    const globalOpts = program.opts();
    const verbose = globalOpts?.verbose === true;

    // Auto-discover plugins
    await discoverPlugins({ verbose });

    const chips = chipRegistry.list();

    if (options.json) {
      const details = chips.map(name => {
        const plugin = chipRegistry.get(name)!;
        return { name: plugin.name, version: plugin.version, channels: plugin.channels };
      });
      console.log(JSON.stringify(details, null, 2));
      return;
    }

    console.log('Available chip backends:');
    console.log('');
    for (const name of chips) {
      const plugin = chipRegistry.get(name)!;
      const star = name === 'gameboy' ? ' (built-in)' : '';
      console.log(`  • ${name}${star}`);
      console.log(`      Version:  ${plugin.version}`);
      console.log(`      Channels: ${plugin.channels}`);
      console.log('');
    }
  });

program.parse();
