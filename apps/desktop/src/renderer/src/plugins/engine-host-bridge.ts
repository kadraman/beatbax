/**
 * Populates the renderer namespaces that beatbax-host bridge modules re-export.
 * Called before any user plugin module is imported.
 */

import * as engineRoot from '@beatbax/engine';
import * as engineChips from '@beatbax/engine/chips';
import * as engineParser from '@beatbax/engine/parser';
import * as engineExport from '@beatbax/engine/export';
import * as enginePatterns from '@beatbax/engine/patterns';
import * as engineScheduler from '@beatbax/engine/scheduler';
import * as engineSong from '@beatbax/engine/song';
import * as engineAudio from '@beatbax/engine/audio/playback';
import * as engineUtilMusic from '@beatbax/engine/util/music';
import * as engineSequences from '@beatbax/engine/sequences/expand';
import * as engineInstrumentSerialize from '@beatbax/engine/instruments/serialize';
import * as engineInstrumentWaveform from '@beatbax/engine/instruments/waveform';
import * as engineInstrumentState from '@beatbax/engine/instruments/instrumentState';

declare global {
  // eslint-disable-next-line no-var
  var __BEATBAX_ENGINE_HOST__: Record<string, unknown> | undefined;
}

function namespaceFrom(...mods: object[]): Record<string, unknown> {
  const api: Record<string, unknown> = {};
  let explicitDefault: unknown;
  for (const mod of mods) {
    for (const [key, value] of Object.entries(mod)) {
      if (key === '__esModule') continue;
      if (key === 'default') {
        if (explicitDefault === undefined) explicitDefault = value;
        continue;
      }
      api[key] = value;
    }
  }
  return { ...api, default: explicitDefault ?? api };
}

export function installEngineHostBridge(): void {
  globalThis.__BEATBAX_ENGINE_HOST__ = {
    root: namespaceFrom(engineRoot),
    chips: namespaceFrom(engineChips),
    parser: namespaceFrom(engineParser),
    audio: namespaceFrom(engineAudio),
    export: namespaceFrom(engineExport),
    instruments: namespaceFrom(engineInstrumentSerialize, engineInstrumentWaveform, engineInstrumentState),
    patterns: namespaceFrom(enginePatterns),
    sequences: namespaceFrom(engineSequences),
    scheduler: namespaceFrom(engineScheduler),
    song: namespaceFrom(engineSong),
    'util/music': namespaceFrom(engineUtilMusic),
  };
}
