/**
 * Path / format helpers for `beatbax extract instrument`.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import type { InstrumentKind } from '@beatbax/engine';

export type InstrumentSourceFormat = 'uge';

export interface CollectedInstrumentSource {
  path: string;
  label: string;
  format: InstrumentSourceFormat;
}

export function detectInstrumentSource(filePath: string, from?: string): InstrumentSourceFormat | 'unknown' {
  if (from !== undefined && from !== '') {
    const normalized = from.trim().toLowerCase();
    if (normalized === 'uge') return 'uge';
    return 'unknown';
  }
  return extname(filePath).toLowerCase() === '.uge' ? 'uge' : 'unknown';
}

export function parseInstrumentKinds(list?: string): InstrumentKind[] | undefined {
  if (list === undefined) return undefined;
  const kinds: InstrumentKind[] = [];
  for (const raw of list.split(',')) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    if (token !== 'pulse' && token !== 'wave' && token !== 'noise') {
      throw new Error(`unknown instrument type '${raw.trim()}'; expected pulse, wave, and/or noise`);
    }
    if (!kinds.includes(token)) kinds.push(token);
  }
  if (kinds.length === 0) {
    throw new Error('expected at least one of pulse, wave, noise for --type');
  }
  return kinds;
}

export function peelKitOutputArgument(args: string[], outOption?: string): { inputs: string[]; kitOut?: string } {
  const trailingIns = args.length >= 2 && extname(args[args.length - 1]).toLowerCase() === '.ins';
  const inputs = trailingIns ? args.slice(0, -1) : args;
  if (outOption) return { inputs, kitOut: outOption };
  if (trailingIns) return { inputs, kitOut: args[args.length - 1] };
  return { inputs: args };
}

export function defaultKitPathForInputs(inputArgs: string[]): string | undefined {
  if (inputArgs.length !== 1) return undefined;
  const abs = resolve(inputArgs[0]);
  if (!existsSync(abs) || statSync(abs).isDirectory()) return undefined;
  const ext = extname(abs);
  return join(dirname(abs), `${basename(abs, ext)}.ins`);
}

function listUgeInDirectory(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.uge'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(dir, name));
}

export function expandExtractInputs(
  inputArgs: string[],
  from?: string,
): {
  sources: CollectedInstrumentSource[];
  skippedUnknown: string[];
  emptyDirs: string[];
  missing: string[];
  notFileOrDir: string[];
} {
  const sources: CollectedInstrumentSource[] = [];
  const skippedUnknown: string[] = [];
  const emptyDirs: string[] = [];
  const missing: string[] = [];
  const notFileOrDir: string[] = [];
  const seen = new Set<string>();

  for (const raw of inputArgs) {
    const abs = resolve(raw);
    if (!existsSync(abs)) {
      missing.push(raw);
      continue;
    }
    const st = statSync(abs);
    if (st.isDirectory()) {
      const files = listUgeInDirectory(abs);
      if (files.length === 0) {
        emptyDirs.push(raw);
        continue;
      }
      for (const file of files) {
        const key = resolve(file);
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push({ path: key, label: basename(file), format: 'uge' });
      }
      continue;
    }
    if (!st.isFile()) {
      notFileOrDir.push(raw);
      continue;
    }
    const format = detectInstrumentSource(abs, from);
    if (format === 'unknown') {
      skippedUnknown.push(raw);
      continue;
    }
    const key = abs;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ path: key, label: basename(abs), format });
  }

  return { sources, skippedUnknown, emptyDirs, missing, notFileOrDir };
}

export function defaultDemoPath(kitPath: string): string {
  const ext = extname(kitPath);
  const stem = basename(kitPath, ext || undefined);
  return join(dirname(kitPath), `${stem}-demo.bax`);
}
