/**
 * Shared action for `beatbax import midi` and `beatbax convert midi2bax`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import {
  convertMidiToBax,
  inspectMidiBytes,
  parseImportConfig,
  resolveConvertOptions,
  type ConversionDiagnostic,
  type MidiImportConfig,
  type MidiInspectReport,
} from '@beatbax/engine/import';

export interface MidiImportCliOptions {
  chip?: string;
  config?: string;
  quantize?: string;
  grid?: string;
  maxBars?: string;
  maxOverlapTicks?: string;
  sectionBars?: string;
  dryRun?: boolean;
  strict?: boolean;
  title?: string;
  verbose?: boolean;
  inspect?: boolean;
  json?: boolean;
  annotate?: boolean;
}

function formatBars(first: number, last: number): string {
  return first === last ? String(first) : `${first}-${last}`;
}

/** Deterministic text form of the engine inspect report (spec FR-050). */
export function formatInspectReport(report: MidiInspectReport): string {
  const lines: string[] = [];
  const title = report.name ? `"${report.name}"` : '(untitled)';
  lines.push(
    `MIDI inspect: ${title} — PPQ ${report.ppq}, ${report.trackCount} track(s), ${report.bars} bar(s)`,
  );
  const sigs = report.timeSignatures.length
    ? report.timeSignatures.map((t) => `${t.numerator}/${t.denominator} @ bar ${t.bar}`).join(', ')
    : '4/4 (none in file)';
  lines.push(`Time signatures: ${sigs}`);
  const tempos = report.tempos.length
    ? report.tempos.map((t) => `${t.bpm} @ bar ${t.bar}`).join(', ')
    : '120 (none in file)';
  lines.push(`Tempos: ${tempos}`);
  lines.push(`First tempo: ${report.firstBpm} bpm; longest-held tempo: ${report.longestBpm} bpm`);
  lines.push('');

  const header = ['Track', 'Ch', 'Program', 'Name', 'Notes', 'Range', 'Bars', `Activity/${report.activityBlockBars} bars`];
  const rows = report.tracks.map((t) => [
    t.id,
    String(t.channel),
    t.programName ? `${t.program} ${t.programName}` : String(t.program),
    t.name || '-',
    String(t.notes),
    t.lowPitch === t.highPitch ? t.lowNote : `${t.lowNote}-${t.highNote}`,
    formatBars(t.firstBar, t.lastBar),
    t.activity.join(' ') + (t.duplicateOf ? `  (duplicate of ${t.duplicateOf})` : ''),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]!)))
      .join('  ')
      .trimEnd();
  lines.push(fmt(header));
  for (const r of rows) lines.push(fmt(r));
  if (rows.length === 0) lines.push('(no tracks with notes)');
  return lines.join('\n');
}

function runMidiInspect(input: string, outputPath: string | undefined, options: MidiImportCliOptions, fail: (msg: string) => never): void {
  const ignored: string[] = [];
  if (options.chip) ignored.push('--chip');
  if (options.config) ignored.push('--config');
  if (outputPath) ignored.push('output path');
  if (ignored.length) {
    console.error(`Warning: --inspect ignores ${ignored.join(', ')} (inspect never writes files)`);
  }

  let report: MidiInspectReport;
  try {
    report = inspectMidiBytes(readFileSync(input));
  } catch (err: any) {
    fail(`Error: MIDI inspect failed: ${err.message ?? err}`);
  }
  console.log(options.json ? JSON.stringify(report, null, 2) : formatInspectReport(report));
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

  if (options.json && !options.inspect) {
    fail('Error: --json requires --inspect');
  }
  if (options.inspect) {
    runMidiInspect(input, outputPath, options, fail);
    return;
  }
  if (!options.chip) {
    fail('Error: --chip is required (gameboy | nes)');
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

  let sectionBars: number | undefined;
  if (options.sectionBars != null) {
    sectionBars = Number(String(options.sectionBars));
    if (!Number.isFinite(sectionBars) || sectionBars < 0 || !Number.isInteger(sectionBars)) {
      fail('Error: --section-bars must be an integer >= 0 (0 = monolithic)');
    }
  }

  let resolved;
  try {
    resolved = resolveConvertOptions({
      chip: options.chip!,
      config,
      quantize: options.quantize,
      grid: options.grid,
      maxBars,
      maxOverlapTicks,
      sectionBars,
      strict: options.strict === true,
      title: options.title,
      annotate: options.annotate === true ? true : undefined,
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
    { flags: '--chip <chip>', description: 'Target chip (required unless --inspect): gameboy | nes' },
    { flags: '--config <file>', description: 'Optional JSON mapping/quantize override' },
    { flags: '--quantize <mode>', description: 'nearest | floor | ceil | strict' },
    { flags: '--grid <grid>', description: '1/4 | 1/8 | 1/16 | 1/32' },
    { flags: '--max-bars <N>', description: 'Clamp generated bar count' },
    { flags: '--max-overlap-ticks <N>', description: 'Allow up to N ticks of overlap when multiplexing' },
    {
      flags: '--section-bars <N>',
      description: 'Bars per Pattern Grid section (default 8; 0 = monolithic one seq per channel)',
    },
    { flags: '--dry-run', description: 'Print conversion summary only; do not write .bax' },
    { flags: '--strict', description: 'Fail on strict quantize / conversion errors' },
    { flags: '--title <name>', description: 'Override song name metadata' },
    { flags: '--inspect', description: 'Print a per-track report of the MIDI file; writes nothing' },
    { flags: '--json', description: 'With --inspect: print the report as JSON' },
    { flags: '--annotate', description: 'Prepend a comment block explaining channel mappings, drops and timing' },
  ];
}
