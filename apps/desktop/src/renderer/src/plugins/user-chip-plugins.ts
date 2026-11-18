/**
 * Desktop host bridge + loader for user-installed chip plugins (spec 111).
 */

import { chipRegistry } from '@beatbax/engine/chips';
import * as engineRoot from '@beatbax/engine';
import * as engineChips from '@beatbax/engine/chips';
import * as engineParser from '@beatbax/engine/parser';
import * as engineExport from '@beatbax/engine/export';
import * as enginePatterns from '@beatbax/engine/patterns';
import * as engineScheduler from '@beatbax/engine/scheduler';
import * as engineSong from '@beatbax/engine/song';
import type { DesktopUserChipPluginInfo } from '../../../shared/electron-api';

declare global {
  // eslint-disable-next-line no-var
  var __BEATBAX_ENGINE_HOST__: Record<string, unknown> | undefined;
}

export function installEngineHostBridge(): void {
  globalThis.__BEATBAX_ENGINE_HOST__ = {
    root: engineRoot,
    chips: engineChips,
    parser: engineParser,
    audio: {},
    export: engineExport,
    instruments: {},
    patterns: enginePatterns,
    sequences: {},
    scheduler: engineScheduler,
    song: engineSong,
    'util/music': {},
  };

  // Optional subpaths — populate when the host build resolves them.
  void Promise.allSettled([
    import('@beatbax/engine/util/music').then((mod) => {
      if (globalThis.__BEATBAX_ENGINE_HOST__) globalThis.__BEATBAX_ENGINE_HOST__['util/music'] = mod;
    }),
  ]);
}

function isChipPluginShape(value: unknown): value is { name: string; createChannel: (...args: unknown[]) => unknown } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { name?: unknown }).name === 'string' &&
      typeof (value as { createChannel?: unknown }).createChannel === 'function'
  );
}

/**
 * Load enabled user plugins after bundled catalogue registration.
 * Failures are logged and do not abort startup.
 */
export async function loadEnabledUserChipPlugins(): Promise<string[]> {
  const warnings: string[] = [];
  const api = window.electronAPI;
  if (!api?.listUserChipPlugins) return warnings;

  installEngineHostBridge();

  let plugins: DesktopUserChipPluginInfo[] = [];
  try {
    plugins = await api.listUserChipPlugins();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Failed to list user chip plugins: ${message}`);
    api.logDiagnostics?.({
      level: 'warn',
      source: 'user-chip-plugins',
      message: warnings[warnings.length - 1]!,
    });
    return warnings;
  }

  for (const entry of plugins) {
    if (!entry.enabled) continue;
    if (entry.missingOnDisk) {
      const msg = `User chip plugin "${entry.packageName}" is enabled but missing on disk; skipped.`;
      warnings.push(msg);
      api.logDiagnostics?.({ level: 'warn', source: 'user-chip-plugins', message: msg });
      continue;
    }
    try {
      const mod = await import(/* @vite-ignore */ entry.entryUrl);
      const plugin = mod?.default ?? mod;
      if (!isChipPluginShape(plugin)) {
        throw new Error('default export is not a valid ChipPlugin (need name + createChannel)');
      }
      if (chipRegistry.has(plugin.name)) {
        warnings.push(
          `User chip plugin "${entry.packageName}" chip "${plugin.name}" is already registered; skipped.`
        );
        continue;
      }
      chipRegistry.register(plugin as Parameters<typeof chipRegistry.register>[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const msg = `Failed to load user chip plugin "${entry.packageName}": ${message}`;
      warnings.push(msg);
      api.logDiagnostics?.({ level: 'warn', source: 'user-chip-plugins', message: msg });
    }
  }

  return warnings;
}
