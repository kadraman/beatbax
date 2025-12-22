import { Command } from 'commander';
import { playFile, readUGEFile, getUGESummary } from '@beatbax/engine';
import { exportJSON, exportMIDI, exportUGE, exportWAVFromSong } from '@beatbax/engine/export';
import { readFileSync } from 'fs';
import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song/resolver';

type ValidationResult = { errors: string[]; warnings: string[]; ast: any };

function validateSource(src: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Pre-scan for empty `seq NAME =` lines — treat as errors.
  const seqEmptyRe = /^\s*seq\s+([A-Za-z_][A-Za-z0-9_\-]*)\s*=\s*$/gm;
  let mm: RegExpExecArray | null;
  while ((mm = seqEmptyRe.exec(src)) !== null) {
    errors.push(
      `Sequence '${mm[1]}' has no RHS content (empty). ` +
        `Define patterns after '=' or remove the empty 'seq ${mm[1]} =' line.`
    );
  }

  const ast = parse(src);

  // Validate channels and instruments
  for (const ch of ast.channels || []) {
    if (ch.inst && !ast.insts[ch.inst]) {
      errors.push(`Channel ${ch.id} references unknown inst '${ch.inst}'`);
    }
    // collect sequence base names referenced by channel
    const extractSeqBaseNames = (ch2: any): string[] => {
      const names: string[] = [];
      if (!ch2 || !ch2.pat) return names;
      if (Array.isArray(ch2.pat)) {
        for (const it of ch2.pat) {
          if (typeof it === 'string') names.push(it.split(':')[0]);
        }
        return names.filter(Boolean);
      }
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
        warnings.push(`Channel ${ch.id} references unknown sequence '${baseSeqName}'`);
      }
    }
  }

  // Validate patterns
  for (const [name, pat] of Object.entries(ast.pats || {})) {
    if (!Array.isArray(pat) || (pat as any[]).length === 0) {
      errors.push(`Pattern '${name}' is empty or malformed`);
    }
  }

  // Validate sequences reference valid patterns
  if (ast.seqs) {
    for (const [seqName, patRefs] of Object.entries(ast.seqs)) {
      if (!Array.isArray(patRefs) || (patRefs as any[]).length === 0) {
        errors.push(`Sequence '${seqName}' is empty or malformed`);
      } else {
        for (const patRef of patRefs as any[]) {
          let basePatName = typeof patRef === 'string' ? patRef.split(':')[0] : patRef;
          if (typeof basePatName === 'string') {
            const mRep = basePatName.match(/^(.+?)\*(\d+)$/);
            if (mRep) basePatName = mRep[1];
            if (!ast.pats[basePatName]) {
              warnings.push(`Sequence '${seqName}' references unknown pattern '${basePatName}'`);
            }
          }
        }
      }
    }
  }

  return { errors, warnings, ast };
}

const program = new Command();

program
  .name('beatbax')
  .description('Live-coding language for retro console chiptunes')
  .version('0.1.0');

// Global options
program
  .option('-v, --verbose', 'Enable verbose output for all commands')
  .option('--debug', 'Enable debug output (print stack traces)');

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
    const globalOpts = program.opts();
    const verbose = options.verbose === true || (globalOpts && globalOpts.verbose === true);
    // Read and validate before starting playback to avoid playing invalid files.
    const src = readFileSync(file, 'utf8');
    const { errors, warnings } = validateSource(src);
    if (errors.length > 0) {
      console.error(`Validation failed for ${file}:`);
      for (const e of errors) console.error('  -', e);
      process.exitCode = 2;
      return;
    }
    if (warnings.length > 0 && verbose) {
      console.warn(`Validation warnings for ${file}:`);
      for (const w of warnings) console.warn('  -', w);
    }

    await playFile(file, {
      browser: options.browser === true,
      noBrowser: options.headless === true || options.backend === 'node-webaudio',
      backend: options.backend,
      sampleRate: parseInt(options.sampleRate, 10),
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
      const src = readFileSync(file, 'utf8');
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

      const ast = parse(src);
      // merge any pre-scan warnings with runtime validations

      const extractSeqBaseNames = (ch: any): string[] => {
        const names: string[] = [];
        if (!ch || !ch.pat) return names;
        if (Array.isArray(ch.pat)) {
          for (const it of ch.pat) {
            if (typeof it === 'string') names.push(it.split(':')[0]);
          }
          return names.filter(Boolean);
        }
        // If parser attached raw seqSpecTokens (space-preserved), prefer them
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
          errors.push(`Channel ${ch.id} references unknown inst '${ch.inst}'`);
        }
        const bases = extractSeqBaseNames(ch);
        for (const baseSeqName of bases) {
          if (!ast.seqs || !ast.seqs[baseSeqName]) {
            warnings.push(`Channel ${ch.id} references unknown sequence '${baseSeqName}'`);
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
      if (errors.length > 0) {
        console.error(`Validation failed for ${file}:`);
        for (const e of errors) console.error('  -', e);
        process.exitCode = 2;
      } else if (warnings.length > 0) {
        console.warn(`Validation warnings for ${file}:`);
        for (const w of warnings) console.warn('  -', w);
        console.log(`OK: ${file} parsed (with warnings)`);
        process.exitCode = 0;
      } else {
        console.log(`OK: ${file} parsed and basic validation passed`);
        process.exitCode = 0;
      }
    } catch (err: any) {
      const globalOpts = program.opts();
      if (globalOpts && globalOpts.debug) {
        console.error('Error parsing file:', err && err.stack ? err.stack : err);
      } else {
        console.error('Error parsing file:', err && err.message ? err.message : err);
      }
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
    const globalOpts = program.opts();
    const verbose = (globalOpts && globalOpts.verbose === true) || false;
    const src = readFileSync(file, 'utf8');
    const { errors, warnings, ast } = validateSource(src);
    if (errors.length > 0) {
      console.error(`Validation failed for ${file}:`);
      for (const e of errors) console.error('  -', e);
      process.exitCode = 2;
      return;
    }
    if (warnings.length > 0 && (options as any).verbose || verbose) {
      console.warn(`Validation warnings for ${file}:`);
      for (const w of warnings) console.warn('  -', w);
    }
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

    if (format === 'json') await exportJSON(song, outPath, { debug: globalOpts && globalOpts.debug === true });
    else if (format === 'midi') await exportMIDI(song, outPath, { duration, channels }, { debug: globalOpts && globalOpts.debug === true });
    else if (format === 'uge') await exportUGE(song, outPath, { debug: globalOpts && globalOpts.debug === true });
    else if (format === 'wav') {
      await exportWAVFromSong(song, outPath, {
        duration,
        renderChannels: channels
      }, { debug: globalOpts && globalOpts.debug === true });
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
      const globalOpts = program.opts();
      if (globalOpts && globalOpts.debug) {
        console.error('Failed to inspect file:', err && err.stack ? err.stack : err);
      } else {
        console.error('Failed to inspect file:', err && err.message ? err.message : err);
      }
      process.exitCode = 2;
    }
  });

program.parse();
