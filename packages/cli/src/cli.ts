import { Command, Argument } from 'commander';
import { readUGEFile, getUGESummary, chipRegistry, exporterRegistry, getSongValidationIssues } from '@beatbax/engine';
import { playFile } from '@beatbax/engine/node';
import type { ChipPlugin, ExporterPlugin } from '@beatbax/engine';
import * as engineImports from '@beatbax/engine/import';
import { configureLogging } from '@beatbax/engine/util/logger';
import { readFileSync, statSync, existsSync, writeFileSync } from 'fs';
import { writeExportPayload } from '@beatbax/engine/export';
import { resolve as resolvePath, basename, dirname, relative, extname } from 'path';
import { mkdirSync } from 'fs';
import { parse, parseWithPeggy } from '@beatbax/engine/parser';
import { resolveSongAsync, resolveImports } from '@beatbax/engine/song';

const { getUGEDetailedJSON } = engineImports as any;

interface SourceLocation {
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
}

type ValidationIssue = { message: string; loc?: SourceLocation; component?: string };
type ValidationResult = { errors: ValidationIssue[]; warnings: ValidationIssue[]; ast: any };
const PARSER_COMPONENT = 'parser';

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

function resolveExporterForChip(format: string, chipName: string): ExporterPlugin | undefined {
  const chip = chipRegistry.resolve(chipName.toLowerCase());
  return exporterRegistry.list(chip).find((p) => p.id.toLowerCase() === format.toLowerCase());
}

function listExporterIds(chipName?: string): string[] {
  return (chipName ? exporterRegistry.list(chipName) : exporterRegistry.all()).map((p) => p.id).sort();
}

function formatOutputExtension(plugin: ExporterPlugin): string {
  return plugin.extension.replace(/^\./, '') || plugin.id;
}

async function validateSource(src: string, filename?: string): Promise<ValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  let parseResult: ReturnType<typeof parseWithPeggy>;
  try {
    parseResult = parseWithPeggy(src);
  } catch (parseThrown: any) {
    const loc = parseThrown?.location ?? parseThrown?.loc ?? undefined;
    const message = filename
      ? formatParseError({ message: extractErrorMessage(parseThrown), location: loc }, filename)
      : extractErrorMessage(parseThrown);
    errors.push({ message, loc, component: PARSER_COMPONENT });
    return { errors, warnings, ast: null as any };
  }
  let ast: any = parseResult.ast;

  for (const parseErr of parseResult.errors) {
    const errObj: any = { message: parseErr.message, location: parseErr.loc };
    const formattedError = filename ? formatParseError(errObj, filename) : parseErr.message;
    errors.push({ message: formattedError, loc: parseErr.loc, component: PARSER_COMPONENT });
  }
  const hasSyntaxErrors = parseResult.hasErrors;

  // Resolve imports BEFORE promoting diagnostics so that instruments/sequences
  // introduced by imports are visible when we decide which diagnostics are real.
  if (!hasSyntaxErrors && ast.imports && ast.imports.length > 0 && filename) {
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

  // Song-level chip validation after import resolution (parser skips this when imports are present).
  if (!hasSyntaxErrors && ast?.imports?.length > 0 && ast?.chip && ast?.insts) {
    const existingMessages = new Set(warnings.map(w => w.message));
    for (const e of getSongValidationIssues(ast)) {
      if (!existingMessages.has(e.message)) {
        warnings.push({ message: e.message, component: chipRegistry.resolve(String(ast.chip).toLowerCase()) });
        existingMessages.add(e.message);
      }
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
  .description('Play a .bax song file or a raw .dmc sample file.')
  .argument('<file>', 'Path to the .bax song file or .dmc sample file')
  .option('-b, --browser', 'Launch browser-based playback (opens web UI)')
  .option('--headless', 'Force headless Node.js playback (default in Node)')
  .option('--no-browser', 'Force headless Node.js playback (alias for --headless)')
  .option('--backend <name>', 'Audio backend: auto (default), node-webaudio, browser', 'auto')
  .option('--buffer-frames <n>', 'Buffer length in frames for offline rendering (optional)', '4096')
  .option('--play-gain <scale>', 'Output gain multiplier for headless CLI playback (default: 1.0; peak-limited)', '1.0')
  .option('--rate <index>', 'DMC rate table index 0-15 (only for .dmc files, default 15 = 33 kHz)', '15')
  .option('-v, --verbose', 'Enable verbose output (show parsed AST)')
  .action(async (file, options) => {
    const globalOpts = program.opts();
    configureLoggerFromCLI(options, globalOpts);
    const verbose = options.verbose === true || (globalOpts && globalOpts.verbose === true);
    ensureFileExists(file);

    // ── .dmc sample playback ──────────────────────────────────────────────
    if (file.toLowerCase().endsWith('.dmc')) {
      const { playAudioBuffer } = await import('@beatbax/engine/node');
      const { decodeDMC, DMC_RATE_TABLE } = await import('@beatbax/engine/chips/nes');
      const rateIdx = Math.max(0, Math.min(15, parseInt(options.rate ?? '7', 10)));
      const dmcHz = DMC_RATE_TABLE[rateIdx];
      const sampleRate = parseInt(globalOpts.sampleRate, 10) || 44100;
      const rawBytes = readFileSync(file);
      const decoded = decodeDMC(new Uint8Array(rawBytes));
      const durationSec = decoded.length / dmcHz;
      if (verbose) {
        console.log(`Playing DMC sample: ${file}`);
        console.log(`  Size: ${rawBytes.length} bytes (${decoded.length} samples)`);
        console.log(`  Rate index: ${rateIdx} (${dmcHz.toFixed(2)} Hz)`);
        console.log(`  Duration: ${durationSec.toFixed(3)}s`);
      } else {
        console.log(`Playing ${file} (rate=${rateIdx}, ${durationSec.toFixed(2)}s)`);
      }
      const playGain = Number.parseFloat(String(options.playGain ?? '1.0'));
      // Upsample from dmcHz to sampleRate
      const phaseInc = dmcHz / sampleRate;
      const outLen = Math.ceil(decoded.length / phaseInc);
      const pcm = new Float32Array(outLen);
      let pos = 0;
      let phase = 0;
      for (let i = 0; i < outLen && pos < decoded.length; i++) {
        pcm[i] = decoded[Math.floor(pos)];
        phase += phaseInc;
        const steps = Math.floor(phase);
        if (steps > 0) { pos += steps; phase -= steps; }
      }
      await playAudioBuffer(pcm, {
        channels: 1,
        sampleRate,
        gainScale: Number.isFinite(playGain) ? playGain : 1.0,
      });
      return;
    }

    // ── .bax song playback ────────────────────────────────────────────────
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

    const parsedPlayGain = Number.parseFloat(String(options.playGain ?? '1.0'));
    const playGain = Number.isFinite(parsedPlayGain) ? parsedPlayGain : 1.0;

    await playFile(file, {
      browser: options.browser === true,
      noBrowser: (options.browser !== true) || options.headless === true || options.backend === 'node-webaudio',
      backend: options.backend,
      sampleRate: parseInt(globalOpts.sampleRate, 10),
      playGain,
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
    // resolver warnings (e.g. channel expansion issues).
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
  .description('Export a song using a registered exporter plugin')
  .addArgument(new Argument('[format]', 'Target export format'))
  .argument('[file]', 'Path to the .bax song file')
  .argument('[output]', 'Output file path (optional)')
  .option('-o, --out <path>', 'Output file path (overrides default)')
  .option('-d, --duration <seconds>', 'Duration for rendering in seconds (WAV and MIDI only)')
  .option('-c, --channels <channels>', 'Comma-separated list of channels to render, e.g., "1,2" (WAV and MIDI only)')
  .option('-b, --bit-depth <depth>', 'Bit depth for WAV export (16, 24, 32)', '16')
  .option('--normalize', 'Normalize audio peak to 0.95 (WAV only)', false)
  .option('--strict-gb', 'Fail export when numeric pan values are present (strict Game Boy compatibility)', false)
  .action(async (format, file, output, options) => {
    // No format given — list all available export formats and exit
    if (!format) {
      const all = listExporterIds();
      console.log('Available export formats:');
      for (const id of all) console.log(`  ${id}`);
      console.log('\nUsage: beatbax export <format> <file> [output]');
      console.log('       beatbax export <format> --help   (format-specific help)');
      return;
    }
    // `file` is missing — user ran `beatbax export <format>` without a file,
    // or provided only one positional arg that was consumed as `format`.
    if (!file) {
      console.error(`Error: 'format' and 'file' are both required.`);
      const all = listExporterIds();
      console.error(`Available export formats: ${all.join(', ')}`);
      console.error(`Usage: beatbax export <format> <file> [output]`);
      process.exitCode = 1;
      return;
    }
    ensureFileExists(file);
    const requestedFormat = String(format).toLowerCase();
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

    const chipName = chipRegistry.resolve(String(ast.chip || 'gameboy').toLowerCase());
    const chipPlugin = chipRegistry.get(chipName);
    const exporter = resolveExporterForChip(requestedFormat, chipName);
    if (!exporter) {
      const forChip = listExporterIds(chipName);
      const all = listExporterIds();
      console.error(`Unknown export format '${requestedFormat}' for chip '${chipName}'.`);
      if (forChip.length > 0) {
        console.error(`Available formats for '${chipName}': ${forChip.join(', ')}`);
      } else {
        console.error(`No exporters are registered for chip '${chipName}'.`);
      }
      console.error(`All registered formats: ${all.join(', ')}`);
      process.exitCode = 2;
      return;
    }

    const validationErrors = exporter.validate?.(song) ?? [];
    if (validationErrors.length > 0) {
      console.error(`Exporter validation failed for '${requestedFormat}':`);
      for (const message of validationErrors) console.error('  -', message);
      process.exitCode = 2;
      return;
    }

    // If no output path provided, generate one based on input filename and format
    if (!outPath) {
      outPath = file.replace(/\.[^/.]+$/, "") + `.${formatOutputExtension(exporter)}`;
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

    const exporterWarnings: string[] = [];

    const payload = await exporter.export(song, {
      outputPath: outPath,
      sourcePath: file,
      duration,
      channels,
      bitDepth: bitDepth as 16 | 24 | 32,
      normalize: options.normalize === true,
      strictGb: Boolean((options as any).strictGb),
      sampleRate: globalOpts.sampleRate ? parseInt(globalOpts.sampleRate, 10) : 44100,
      debug: globalOpts && globalOpts.debug === true,
      verbose: globalOpts && globalOpts.verbose === true,
      resolveSampleAsset: typeof chipPlugin?.resolveSampleAsset === 'function'
        ? (ref: string) => chipPlugin.resolveSampleAsset!(ref)
        : undefined,
      onWarn: (message: string) => {
        if (typeof message === 'string' && message.trim().length > 0) {
          exporterWarnings.push(message);
        }
      },
    });

    if (payload !== undefined && !writeExportPayload(outPath, payload)) {
      console.error(`Exporter '${requestedFormat}' returned unsupported payload type.`);
      process.exitCode = 2;
      return;
    }

    if (!existsSync(outPath)) {
      console.error(`Exporter '${requestedFormat}' completed but did not write an output file.`);
      process.exitCode = 2;
      return;
    }

    const uniqueExporterWarnings = [...new Set(exporterWarnings)];

    if (uniqueExporterWarnings.length > 0) {
      console.log(`\n⚠️  Export warnings`);
      for (const message of uniqueExporterWarnings) {
        console.log(`  [exporter] ${message}`);
      }
      console.log('');
      if (globalOpts && globalOpts.strict) {
        console.error('Strict mode enabled: failing due to warnings');
        process.exitCode = 2;
        return;
      }
    }

    const stats = statSync(outPath);
    let debugInfo = '';
    if (globalOpts && globalOpts.debug) {
      if (requestedFormat === 'wav') {
        const sr = globalOpts.sampleRate ? parseInt(globalOpts.sampleRate, 10) : 44100;
        debugInfo = ` [DEBUG: ${sr}Hz, ${bitDepth}-bit, 2ch]`;
      } else if (requestedFormat === 'midi') {
        debugInfo = ` [DEBUG: ${song.channels.length} tracks]`;
      } else if (requestedFormat === 'uge') {
        debugInfo = ` [DEBUG: v6]`;
      } else if (requestedFormat === 'json') {
        debugInfo = ` [DEBUG: v1]`;
      }
    }
    console.log(`[OK] Exported ${exporter.label} file: ${outPath} (${stats.size} bytes)${debugInfo}`);
    console.log(`Note: The file extension is ${exporter.extension}`);
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
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
          // Scoped packages (e.g. @beatbax/plugin-chip-sms)
          if (entry.name === '@beatbax') {
            const scopedEntries = readdirSync(join(nmDir, '@beatbax'), { withFileTypes: true });
            for (const scoped of scopedEntries) {
              if ((scoped.isDirectory() || scoped.isSymbolicLink()) && scoped.name.startsWith('plugin-chip-')) {
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

async function discoverExporterPlugins(options: { verbose?: boolean } = {}): Promise<ExporterPlugin[]> {
  const discovered: ExporterPlugin[] = [];
  const candidates: string[] = [];

  try {
    const { readdirSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const cliDir = dirname(fileURLToPath(import.meta.url));

    const searchPaths = [
      join(cliDir, '..', '..', 'node_modules'),
      join(cliDir, '..', '..', '..', 'node_modules'),
      join(process.cwd(), 'node_modules'),
    ];

    for (const nmDir of searchPaths) {
      try {
        const entries = readdirSync(nmDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
          if (entry.name === '@beatbax') {
            const scopedEntries = readdirSync(join(nmDir, '@beatbax'), { withFileTypes: true });
            for (const scoped of scopedEntries) {
              if ((scoped.isDirectory() || scoped.isSymbolicLink()) && scoped.name.startsWith('plugin-exporter-')) {
                candidates.push(`@beatbax/${scoped.name}`);
              }
            }
          }
          if (entry.name.startsWith('beatbax-plugin-exporter-')) {
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

  for (const pkgName of [...new Set(candidates)]) {
    try {
      const mod = await import(pkgName);
      const candidatesFromModule = Array.isArray(mod?.default)
        ? mod.default
        : (Array.isArray(mod?.exporterPlugins)
            ? mod.exporterPlugins
            : [mod?.default || mod?.exporterPlugin || mod]);
      const plugins = candidatesFromModule.filter((plugin: any): plugin is ExporterPlugin =>
        typeof plugin?.id === 'string' && typeof plugin?.export === 'function',
      );

      if (plugins.length === 0) {
        if (options.verbose) {
          console.warn(`[WARN] Skipping '${pkgName}': missing required ExporterPlugin fields (id, export)`);
        }
        continue;
      }

      for (const plugin of plugins) {
        if (!exporterRegistry.has(plugin.id)) {
          exporterRegistry.register(plugin);
          discovered.push(plugin);
          if (options.verbose) {
            console.log(`[plugin] Loaded exporter plugin: '${plugin.id}' from ${pkgName} v${plugin.version}`);
          }
        }
      }
    } catch (err: any) {
      if (options.verbose) {
        console.warn(`[WARN] Failed to load exporter plugin '${pkgName}':`, err.message);
      }
    }
  }

  return discovered;
}

function parseDmcRateOption(options: { dmcRate?: string; rate?: string; q?: string }): number {
  const raw = options.rate ?? options.q ?? options.dmcRate ?? '15';
  const text = String(raw).trim();
  if (!/^(0|[1-9]\d*)$/.test(text)) {
    throw new Error(`invalid --dmc-rate value '${raw}'; expected an integer from 0 to 15`);
  }
  const n = Number(text);
  if (n < 0 || n > 15) {
    throw new Error(`invalid --dmc-rate value '${raw}'; expected an integer from 0 to 15`);
  }
  return n;
}

function failCommand(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}

function isMissingAudioPlayerError(err: unknown): boolean {
  const message = (err as any)?.message ?? String(err ?? '');
  return String(message).includes("Couldn't find a suitable audio player");
}

function sanitizeInstName(name: string): string {
  const base = basename(name, extname(name));
  const safe = base.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]+/, '');
  return safe || 'sample';
}

function toLocalSampleRef(filePath: string): string {
  try {
    const rel = relative(process.cwd(), resolvePath(filePath)).replace(/\\/g, '/');
    if (rel && !rel.startsWith('..')) return `local:${rel}`;
  } catch (_) { /* fall through */ }
  return `local:${filePath.replace(/\\/g, '/')}`;
}

function upsampleDmcForPlayback(
  decoded: Float32Array,
  dmcHz: number,
  sampleRate: number,
  loop: boolean,
  durationSec: number
): Float32Array {
  const phaseInc = dmcHz / sampleRate;
  const naturalLen = Math.ceil(decoded.length / phaseInc);
  const playSec = loop ? Math.max(durationSec * 2, Math.min(3, durationSec + 0.25)) : durationSec;
  const outLen = loop ? Math.ceil(playSec * sampleRate) : naturalLen;
  const pcm = new Float32Array(outLen);
  let pos = 0;
  let phase = 0;
  for (let i = 0; i < outLen; i++) {
    const idx = Math.floor(pos);
    if (idx >= decoded.length) {
      if (loop) {
        pos = 0;
        phase = 0;
        pcm[i] = decoded[0] ?? 0;
      } else {
        break;
      }
    } else {
      pcm[i] = decoded[idx];
    }
    phase += phaseInc;
    const steps = Math.floor(phase);
    if (steps > 0) {
      pos += steps;
      phase -= steps;
    }
  }
  return pcm;
}

const convertCmd = program
  .command('convert')
  .description('Convert between audio and chip sample formats');

convertCmd
  .command('wav2dmc')
  .description('Convert WAV files to NES DMC (.dmc) delta-encoded samples')
  .argument('<inputs...>', 'Input WAV file(s)')
  .option('-o, --output <paths...>', 'Output .dmc path(s); default: same basename as each input')
  .option('--dmc-rate <index>', 'dmc_rate for encode and playback (0=slowest, 15=fastest)', '15')
  .option('-q, --rate <index>', 'Alias for --dmc-rate')
  .option('--dmc-loop', 'Set dmc_loop=true (continuous loop); default false (one-shot)')
  .option('--inst-name <name>', 'Instrument id for --emit-inst (default: input basename)')
  .option('--emit-inst', 'Print ready-to-paste inst line with dmc_rate, dmc_loop, local: sample ref')
  .option('--play', 'Preview output using --dmc-rate and --dmc-loop')
  .option('--ntsc', 'Use NTSC DMC rate table (default)')
  .option('-p, --pal', 'Use PAL DMC rate table')
  .option('--max-bytes <n>', 'Maximum output size in bytes', '4096')
  .option('--normalize', 'Peak-normalize input before encoding')
  .option('--gain <factor>', 'Linear gain before encoding', '1')
  .option('--no-filter', 'Disable low-pass before resampling')
  .option('--trim-silence <db>', 'Trim quiet leading/trailing audio below this dBFS threshold', '-45')
  .option('--no-trim-silence', 'Disable audio silence trimming')
  .option('--tail-ms <ms>', 'Keep this much audio after the last above-threshold sample', '8')
  .option('--fade-out-ms <ms>', 'Fade the end before encoding to reduce noisy tails/clicks', '4')
  .option('--max-duration-ms <ms>', 'Hard cap source audio length before encoding')
  .action(async (inputs: string[], options) => {
    const globalOpts = program.opts();
    configureLoggerFromCLI(options, globalOpts);
    const verbose = options.verbose === true || globalOpts?.verbose === true;

    if (!inputs || inputs.length === 0) {
      console.error('Error: at least one input WAV file is required');
      process.exit(1);
    }

    const outputs: string[] = options.output ?? [];
    if (outputs.length > 0 && outputs.length !== inputs.length) {
      console.error(`Error: ${inputs.length} input(s) but ${outputs.length} output path(s); counts must match`);
      process.exit(1);
    }

    let rateIndex: number;
    try {
      rateIndex = parseDmcRateOption(options);
    } catch (err: any) {
      failCommand(`Error: ${err.message ?? err}`);
    }
    if (options.ntsc === true && options.pal === true) {
      console.error('Error: choose only one DMC clock region (--ntsc or --pal)');
      process.exit(1);
    }
    const region = options.pal ? 'pal' : 'ntsc';
    const dmcLoop = options.dmcLoop === true;
    const maxBytes = Math.max(1, parseInt(String(options.maxBytes ?? '4096'), 10) || 4096);
    const gain = parseFloat(String(options.gain ?? '1')) || 1;
    const trimSilenceDb = parseFloat(String(options.trimSilence ?? '-45'));
    const tailMs = Math.max(0, parseFloat(String(options.tailMs ?? '8')) || 0);
    const fadeOutMs = Math.max(0, parseFloat(String(options.fadeOutMs ?? '4')) || 0);
    const maxDurationMs = options.maxDurationMs === undefined
      ? undefined
      : Math.max(1, parseFloat(String(options.maxDurationMs)) || 1);
    const hostSampleRate = parseInt(globalOpts.sampleRate, 10) || 44100;

    const { readWAV } = await import('@beatbax/engine/export');
    const {
      encodeDMCFromPCM,
      formatDmcInstrumentLine,
      decodeDMC,
      getDmcRateHz,
    } = await import('@beatbax/engine/chips/nes');

    const rateHz = getDmcRateHz(rateIndex, region);

    for (let i = 0; i < inputs.length; i++) {
      const inputPath = inputs[i];
      ensureFileExists(inputPath);

      let outPath = outputs[i];
      if (!outPath) {
        const dir = dirname(resolvePath(inputPath));
        const base = basename(inputPath, extname(inputPath));
        outPath = resolvePath(dir, `${base}.dmc`);
      } else {
        outPath = resolvePath(outPath);
      }

      const outDir = dirname(outPath);
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }

      let wavData;
      try {
        const buf = readFileSync(inputPath);
        wavData = readWAV(buf);
      } catch (err: any) {
        console.error(`Error reading WAV ${inputPath}: ${err.message ?? err}`);
        process.exit(1);
      }

      const result = encodeDMCFromPCM(wavData.samples, wavData.sampleRate, {
        rateIndex,
        region,
        maxBytes,
        trim: true,
        normalize: options.normalize === true,
        gain,
        lowPass: options.noFilter !== true,
        trimSilence: options.trimSilence !== false,
        trimSilenceDb: Number.isFinite(trimSilenceDb) ? trimSilenceDb : -45,
        tailMs,
        fadeOutMs,
        maxDurationMs,
      });

      if (result.byteLength > maxBytes) {
        console.warn(`[WARN] ${inputPath}: encoded ${result.byteLength} bytes exceeds --max-bytes ${maxBytes}`);
      }

      writeFileSync(outPath, Buffer.from(result.bytes));

      const regionLabel = region.toUpperCase();
      console.log(`[OK] ${inputPath} → ${outPath}`);
      console.log(`  ${result.byteLength} bytes, dmc_rate=${rateIndex} (${rateHz.toFixed(2)} Hz ${regionLabel}), ${result.durationSec.toFixed(4)}s`);

      const instName = options.instName
        ? sanitizeInstName(options.instName)
        : sanitizeInstName(inputPath);
      const sampleRef = toLocalSampleRef(outPath);

      if (options.emitInst) {
        console.log(formatDmcInstrumentLine({
          instName,
          sampleRef,
          dmcRate: rateIndex,
          dmcLoop,
        }));
      }

      if (options.play) {
        const { playAudioBuffer } = await import('@beatbax/engine/node');
        const decoded = decodeDMC(result.bytes);
        const pcm = upsampleDmcForPlayback(decoded, rateHz, hostSampleRate, dmcLoop, result.durationSec);
        if (verbose) {
          console.log(`  Playing preview (${dmcLoop ? 'looped' : 'one-shot'})...`);
        }
        try {
          await playAudioBuffer(pcm, {
            channels: 1,
            sampleRate: hostSampleRate,
            gainScale: 1.0,
          });
        } catch (err: any) {
          if (isMissingAudioPlayerError(err)) {
            console.warn(`[WARN] ${inputPath}: preview skipped (no suitable system audio player found)`);
          } else {
            throw err;
          }
        }
      }
    }
  });

program
  .command('list-chips')
  .description('List all available chip backends (built-in and plugin-discovered)')
  .option('--json', 'Output JSON format')
  .action(async (options) => {
    const globalOpts = program.opts();
    const verbose = globalOpts?.verbose === true;

    const chips = chipRegistry.listCanonical();

    if (options.json) {
      const details = chips.map(name => {
        const plugin = chipRegistry.get(name)!;
        const aliases = chipRegistry.aliasesFor(name);
        return { name: plugin.name, version: plugin.version, channels: plugin.channels, aliases };
      });
      console.log(JSON.stringify(details, null, 2));
      return;
    }

    console.log('Available chip backends:');
    console.log('');
    for (const name of chips) {
      const plugin = chipRegistry.get(name)!;
      const star = name === 'gameboy' ? ' (built-in)' : '';
      const aliases = chipRegistry.aliasesFor(name);
      const aliasSuffix = aliases.length ? `  [also: ${aliases.join(', ')}]` : '';
      console.log(`  • ${name}${star}${aliasSuffix}`);
      console.log(`      Version:  ${plugin.version}`);
      console.log(`      Channels: ${plugin.channels}`);
      console.log('');
    }
  });

program
  .command('list-exporters')
  .description('List all available exporter plugins (built-in and plugin-discovered)')
  .option('--chip <name>', 'Filter exporters by chip name')
  .option('--json', 'Output JSON format')
  .action(async (options) => {
    const chip = options.chip ? chipRegistry.resolve(String(options.chip).toLowerCase()) : undefined;
    const exporters = chip ? exporterRegistry.list(chip) : exporterRegistry.all();

    if (options.json) {
      const details = exporters.map((plugin) => ({
        id: plugin.id,
        label: plugin.label,
        version: plugin.version,
        extension: plugin.extension,
        mimeType: plugin.mimeType,
        supportedChips: plugin.supportedChips,
      }));
      console.log(JSON.stringify(details, null, 2));
      return;
    }

    if (chip) {
      console.log(`Available exporters for chip '${chip}':`);
    } else {
      console.log('Available exporters:');
    }
    console.log('');
    for (const plugin of exporters) {
      const chips = plugin.supportedChips.join(', ');
      console.log(`  • ${plugin.id} (.${plugin.extension.replace(/^\./, '')})`);
      console.log(`      Label:   ${plugin.label}`);
      console.log(`      Version: ${plugin.version}`);
      console.log(`      Chips:   ${chips}`);
      console.log('');
    }
  });

// Auto-discover chip plugins once at startup, before program.parse(), so that
// every command (play, verify, export, list-chips) sees third-party chips.
// We cannot rely on a preAction hook because program.opts() is unavailable
// before parse() runs, and async hooks may race with synchronous startup code.
(async () => {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  await discoverPlugins({ verbose });
  await discoverExporterPlugins({ verbose });
  program.parse();
})();
