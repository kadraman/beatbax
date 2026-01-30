import { Command, Argument } from 'commander';
import { playFile, readUGEFile, getUGESummary } from '@beatbax/engine';
import * as engineImports from '@beatbax/engine/import';
import { exportJSON, exportMIDI, exportUGE, exportWAVFromSong } from '@beatbax/engine/export';
import { readFileSync, statSync, existsSync } from 'fs';
import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song/resolver';

const { getUGEDetailedJSON } = engineImports as any;

interface SourceLocation {
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
}

type ValidationIssue = { message: string; loc?: SourceLocation };
type ValidationResult = { errors: ValidationIssue[]; warnings: ValidationIssue[]; ast: any };

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

function validateSource(src: string, filename?: string): ValidationResult {
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
    const verbose = options.verbose === true || (globalOpts && globalOpts.verbose === true);
    // Read and validate before starting playback to avoid playing invalid files.
    ensureFileExists(file);
    const src = readFileSync(file, 'utf8');
    const { errors, warnings } = validateSource(src, file);
    if (errors.length > 0) {
      console.error(`Validation failed for ${file}:`);
      for (const e of errors) console.error('  -', e.message + formatLocation(e.loc));
      process.exitCode = 2;
      return;
    }
    if (warnings.length > 0 && verbose) {
      console.warn(`Validation warnings for ${file}:`);
      for (const w of warnings) console.warn('  -', w.message + formatLocation(w.loc));
    }

    await playFile(file, {
      browser: options.browser === true,
      noBrowser: !options.browser || options.headless === true || options.backend === 'node-webaudio',
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
    try {
      const globalOpts = program.opts();
      const verbose = globalOpts && globalOpts.verbose === true;
      ensureFileExists(file);
      const src = readFileSync(file, 'utf8');

      if (verbose) {
        console.log(`Verifying: ${file}`);
        console.log('  Parsing source...');
      }
      const errors: string[] = [];
      const warnings: string[] = [];

      // Pre-scan source for empty `seq NAME =` lines and emit a clear
      // warning so users see a diagnostics message even if the parser
      // later normalizes or mis-parses complex sequence forms.
      const seqEmptyRe = /^\s*seq\s+([A-Za-z_][A-Za-z0-9_\-]*)\s*=\s*$/gm;
      let mm: RegExpExecArray | null;
      while ((mm = seqEmptyRe.exec(src)) !== null) {
        errors.push(
          `Sequence '${mm[1]}' has no RHS content (empty). ` +
            `Define patterns after '=' or remove the empty 'seq ${mm[1]} =' line.`
        );
      }

      let ast: any;
      // Capture parser warnings that are normally sent to console.warn
      const originalWarn = console.warn;
      const parserWarnings: Array<{ message: string; loc?: string }> = [];
      console.warn = (msg: string) => {
        if (typeof msg === 'string' && msg.startsWith('[WARN]')) {
          // Extract message and optional location info
          // Format: [WARN] [component] message line=X, column=Y
          const fullMatch = msg.match(/^\[WARN\]\s*\[([^\]]+)\]\s*(.+)$/);
          if (fullMatch) {
            const fullText = fullMatch[2].trim();
            // Check for location at the end (format: "message line=X, column=Y")
            const locMatch = fullText.match(/^(.+?)\s+line=(\d+),\s*column=(\d+)$/);
            if (locMatch) {
              const message = locMatch[1].trim();
              const line = locMatch[2];
              const col = locMatch[3];
              parserWarnings.push({ message, loc: ` (line ${line}, column ${col})` });
            } else {
              // No location info, just the message
              parserWarnings.push({ message: fullText, loc: '' });
            }
          } else {
            parserWarnings.push({ message: msg, loc: '' });
          }
        } else {
          originalWarn(msg);
        }
      };

      try {
        ast = parse(src);

        // Add parser warnings to the warnings array
        if (parserWarnings.length > 0) {
          for (const pw of parserWarnings) {
            warnings.push(pw.message + pw.loc);
          }
        }
      } catch (parseErr: any) {
        console.warn = originalWarn;
        console.error(formatParseError(parseErr, file));
        process.exitCode = 2;
        return;
      } finally {
        // Always restore original console.warn
        console.warn = originalWarn;
      }

      if (verbose) {
        console.log('  Source parsed successfully');
        console.log(`  AST structure:`);
        console.log(`    - Patterns: ${Object.keys(ast.pats || {}).length}`);
        console.log(`    - Sequences: ${Object.keys(ast.seqs || {}).length}`);
        console.log(`    - Instruments: ${Object.keys(ast.insts || {}).length}`);
        console.log(`    - Channels: ${(ast.channels || []).length}`);
        if (ast.bpm) console.log(`    - Tempo: ${ast.bpm} BPM`);
        console.log('  Running resolver...');
      }

      // Run the resolver to materialize sequences/channels and collect any
      // resolver warnings (e.g. arrange expansion issues). `play` calls
      // the resolver during playback, but `verify` previously did not,
      // so run it here to ensure the same diagnostics appear.
      const resolverWarnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];
      try {
        resolveSong(ast, { filename: file, onWarn: (d: any) => resolverWarnings.push(d) } as any);
      } catch (resErr: any) {
        const globalOpts = program.opts();
        console.error('Resolver error:', extractErrorMessage(resErr, globalOpts && globalOpts.debug));
        process.exitCode = 2;
        return;
      }
      // merge any pre-scan warnings with runtime validations

      const extractSeqBaseNames = (ch: any): string[] => {
        const names: string[] = [];
        if (!ch || !ch.pat) return names;

        // If parser attached raw seqSpecTokens (space-preserved), prefer them
        // even if ch.pat is already expanded to an array
        const rawTokens: string[] | undefined = (ch as any).seqSpecTokens;
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
        if (Array.isArray(ch.pat)) {
          return [];
        }

        // Fallback: ch.pat is a string like "lead" or "lead*2" or "lead,lead2"
        const spec = String(ch.pat).trim();
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

      for (const ch of ast.channels) {
        if (ch.inst && !ast.insts[ch.inst]) {
          const loc = ch.loc ? formatLocation(ch.loc) : '';
          errors.push(`Channel ${ch.id} references unknown inst '${ch.inst}'${loc}`);
        }
        const bases = extractSeqBaseNames(ch);
        for (const baseSeqName of bases) {
          if (!ast.seqs || !ast.seqs[baseSeqName]) {
            const loc = ch.loc ? formatLocation(ch.loc) : '';
            // Check if it's actually a pattern name (common mistake)
            if (ast.pats && ast.pats[baseSeqName]) {
              warnings.push(`Channel ${ch.id} references '${baseSeqName}' as a sequence, but it's a pattern. Create a sequence first: 'seq myseq = ${baseSeqName}' or use comma-separated patterns with channel directive.${loc}`);
            } else {
              warnings.push(`Channel ${ch.id} references unknown sequence '${baseSeqName}'${loc}`);
            }
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
            // Treat empty sequence definitions as a validation error.
            errors.push(`Sequence '${seqName}' is empty or malformed`);
          } else {
            for (const patRef of patRefs) {
              let basePatName = typeof patRef === 'string' ? patRef.split(':')[0] : patRef;
              if (typeof basePatName === 'string') {
                const mRep = basePatName.match(/^(.+?)\*(\d+)$/);
                if (mRep) basePatName = mRep[1];
                if (!ast.pats[basePatName]) {
                  // treat missing pattern references as warnings rather than fatal
                  warnings.push(`Sequence '${seqName}' references unknown pattern '${basePatName}'`);
                }
              }
            }
          }
        }
      }

      // Validate arrange blocks reference valid sequences
      if (ast.arranges) {
        for (const [arrangeName, arrangeNode] of Object.entries(ast.arranges)) {
          const rows = (arrangeNode as any).arrangements || [];
          for (const row of rows) {
            if (!Array.isArray(row)) continue;
            for (const slot of row) {
              if (!slot || slot === '.' || slot === '-') continue;
              // Extract base name without transforms
              const baseName = String(slot).split(':')[0].trim();
              // Check if it's a sequence or pattern reference
              if (!ast.seqs || !ast.seqs[baseName]) {
                const loc = (arrangeNode as any).loc ? formatLocation((arrangeNode as any).loc) : '';
                // Check if it's actually a pattern name (common mistake)
                if (ast.pats && ast.pats[baseName]) {
                  warnings.push(`Arrange '${arrangeName}' references '${baseName}' as a sequence, but it's a pattern. Create a sequence first: 'seq myseq = ${baseName}'${loc}`);
                } else {
                  warnings.push(`Arrange '${arrangeName}' references unknown sequence '${baseName}'${loc}`);
                }
              }
            }
          }
        }
      }

      // Merge parser-level warnings and resolver warnings
      const allWarnings: string[] = warnings.slice();
      for (const rw of resolverWarnings) {
        const filePart = rw.file ? rw.file : file;
        const linePart = rw.loc && rw.loc.start ? rw.loc.start.line : undefined;
        const colPart = rw.loc && rw.loc.start ? (rw.loc.start.column || 0) : undefined;
        const parts = [`[WARN][${rw.component}] ${rw.message}`, `file=${filePart}`];
        if (linePart !== undefined) parts.push(`line=${linePart}`);
        if (colPart !== undefined) parts.push(`column=${colPart}`);
        allWarnings.push(parts.join(', '));
      }

      if (errors.length > 0) {
        console.error(`Validation failed for ${file}:`);
        for (const e of errors) console.error('  -', e);
        process.exitCode = 2;
      } else if (allWarnings.length > 0) {
        console.warn(`Validation warnings for ${file}:`);
        for (const w of allWarnings) console.warn('  -', w);
        if (globalOpts && globalOpts.strict) {
          console.error('Strict mode enabled: failing due to warnings');
          process.exitCode = 2;
        } else {
          if (verbose) {
            console.log('Verification complete: Valid with warnings');
          }
          console.log(`OK: ${file} parsed (with warnings)`);
          process.exitCode = 0;
        }
      } else {
        if (verbose) {
          console.log('Verification complete: All checks passed');
        }
        console.log(`OK: ${file} parsed and basic validation passed`);
        process.exitCode = 0;
      }
    } catch (err: any) {
      const globalOpts = program.opts();
      console.error('Error parsing file:', extractErrorMessage(err, globalOpts && globalOpts.debug));
      process.exitCode = 2;
    }
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
    const verbose = (globalOpts && globalOpts.verbose === true) || false;
    const src = readFileSync(file, 'utf8');
    const { errors, warnings, ast } = validateSource(src, file);
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
      const shouldShowParserWarnings = (warnings.length > 0 && ((options as any).verbose || verbose));
      if (shouldShowParserWarnings) {
        console.warn(`Validation warnings for ${file}:`);
        for (const w of warnings) console.warn('  -', w.message + formatLocation(w.loc));
      }
      const resolved = resolveSong(ast, { filename: file, onWarn: (d: any) => resolverWarnings.push(d) } as any);
      // merge resolver warnings into combined list for possible strict handling
      const allWarnings: string[] = [];
      for (const rw of resolverWarnings) {
        const filePart = rw.file ? rw.file : file;
        const linePart = rw.loc && rw.loc.start ? rw.loc.start.line : undefined;
        const colPart = rw.loc && rw.loc.start ? (rw.loc.start.column || 0) : undefined;
        const parts = [`[WARN][${rw.component}] ${rw.message}`, `file=${filePart}`];
        if (linePart !== undefined) parts.push(`line=${linePart}`);
        if (colPart !== undefined) parts.push(`column=${colPart}`);
        allWarnings.push(parts.join(', '));
      }
      if (allWarnings.length > 0 && ((options as any).verbose || verbose)) {
        console.warn(`Validation warnings for ${file}:`);
        for (const w of allWarnings) console.warn('  -', w);
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
