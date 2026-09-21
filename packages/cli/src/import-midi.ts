/**
 * Shared action for `beatbax import midi` and `beatbax convert midi2bax`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import {
  convertMidiToBax,
  parseImportConfig,
  resolveConvertOptions,
  type ConversionDiagnostic,
  type MidiImportConfig,
} from '@beatbax/engine/import';

export interface MidiImportCliOptions {
  chip: string;
  config?: string;
  quantize?: string;
  grid?: string;
  maxBars?: string;
  maxOverlapTicks?: string;
  dryRun?: boolean;
  strict?: boolean;
  title?: string;
  verbose?: boolean;
}

function printDiagnostics(diagnostics: ConversionDiagnostic[], verbose: boolean): void {
  for (const d of diagnostics) {
    if (d.level === 'info' && !verbose) continue;
    const prefix = d.level === 'error' ? 'Error' : d.level === 'warn' ? 'Warning' : 'Info';
    console.error(`${prefix}: [${d.code}] ${d.message}`);
  }
}

export function runMidiImport(
  inputPath: string,
  outputPath: string | undefined,
  options: MidiImportCliOptions,
  fail: (msg: string) => never,
): void {
  const input = resolve(inputPath);
  if (!existsSync(input)) {
    fail(`Error: File not found: ${inputPath}`);
  }

  let config: MidiImportConfig | null = null;
  if (options.config) {
    const cfgPath = resolve(options.config);
    if (!existsSync(cfgPath)) {
      fail(`Error: Config file not found: ${options.config}`);
    }
    try {
      const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
      config = parseImportConfig(raw);
    } catch (err: any) {
      fail(`Error: Failed to parse config: ${err.message ?? err}`);
    }
  }

  let maxBars: number | undefined;
  if (options.maxBars != null) {
    maxBars = parseInt(String(options.maxBars), 10);
    if (!Number.isFinite(maxBars) || maxBars < 1) fail('Error: --max-bars must be >= 1');
  }

  let maxOverlapTicks: number | undefined;
  if (options.maxOverlapTicks != null) {
    maxOverlapTicks = parseInt(String(options.maxOverlapTicks), 10);
    if (!Number.isFinite(maxOverlapTicks) || maxOverlapTicks < 0) {
      fail('Error: --max-overlap-ticks must be >= 0');
    }
  }

  let resolved;
  try {
    resolved = resolveConvertOptions({
      chip: options.chip,
      config,
      quantize: options.quantize,
      grid: options.grid,
      maxBars,
      maxOverlapTicks,
      strict: options.strict === true,
      title: options.title,
    });
  } catch (err: any) {
    fail(`Error: ${err.message ?? err}`);
  }

  let result;
  try {
    const bytes = readFileSync(input);
    result = convertMidiToBax(bytes, resolved, input);
  } catch (err: any) {
    fail(`Error: MIDI conversion failed: ${err.message ?? err}`);
  }

  printDiagnostics(result.diagnostics, options.verbose === true);

  const s = result.summary;
  console.log(
    `MIDI import: ${s.notesImported} notes, ${s.patternsEmitted} pats, ` +
      `${s.channelsPacked} channels, dropped ${s.notesDropped}, bpm ${s.bpm}, chip ${s.chip}`,
  );

  if (options.dryRun) {
    console.log('Dry run: no file written');
    return;
  }

  if (!outputPath) {
    fail('Error: output .bax path is required (unless --dry-run)');
  }

  const out = resolve(outputPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, result.source, 'utf8');
  console.log(`Wrote ${out}`);
}

/** Shared option binder for import midi / convert midi2bax. */
export function midiImportOptionDefs(): { flags: string; description: string; defaultValue?: string }[] {
  return [
    { flags: '--chip <chip>', description: 'Target chip (required): gameboy | nes' },
    { flags: '--config <file>', description: 'Optional JSON mapping/quantize override' },
    { flags: '--quantize <mode>', description: 'nearest | floor | ceil | strict', defaultValue: 'nearest' },
    { flags: '--grid <grid>', description: '1/4 | 1/8 | 1/16 | 1/32', defaultValue: '1/16' },
    { flags: '--max-bars <N>', description: 'Clamp generated bar count' },
    { flags: '--max-overlap-ticks <N>', description: 'Allow up to N ticks of overlap when multiplexing', defaultValue: '0' },
    { flags: '--dry-run', description: 'Print conversion summary only; do not write .bax' },
    { flags: '--strict', description: 'Fail on strict quantize / conversion errors' },
    { flags: '--title <name>', description: 'Override song name metadata' },
  ];
}
