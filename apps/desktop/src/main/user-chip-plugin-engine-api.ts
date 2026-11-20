/**
 * Browser engine surface Desktop exposes to user chip plugins (spec 111).
 * Install scanning, host bridges, and sandbox validation all use this list.
 */

export interface EngineBridgeModule {
  /** Bare specifier plugins may import. */
  specifier: string;
  /** Hostname for beatbax-host:// */
  hostKey: string;
  /** Key on globalThis.__BEATBAX_ENGINE_HOST__ */
  namespaceKey: string;
  /** Named runtime exports the bridge must provide so ESM linking succeeds. */
  exports: readonly string[];
}

export const ENGINE_BRIDGE_MODULES: readonly EngineBridgeModule[] = [
  {
    specifier: '@beatbax/engine',
    hostKey: 'root',
    namespaceKey: 'root',
    exports: [
      'BeatBaxEngine',
      'ChipRegistry',
      'chipRegistry',
      'gameboyPlugin',
      'getSongValidationIssues',
      'ExporterRegistry',
      'exporterRegistry',
      'resolveSong',
      'resolveSongAsync',
      'renderSongToPCM',
      'NOTE_SEMITONES',
      'noteToMidi',
      'midiToNote',
      'midiToFreq',
      'midiToFreqForNote',
      'listInstrumentNoteOptions',
      'parseMacro',
      'macroValue',
      'advanceMacro',
      'makeMacroState',
      'formatMacro',
      'listUgeNoteOptions',
      'serializeInstrument',
      'parseInstrumentBody',
      'formatInstrumentFieldValue',
      'generateWaveformPreset',
      'samplesToHex',
      'parseWaveHexInput',
      'normalizeWaveSamples',
      'parseWaveTable',
    ],
  },
  {
    specifier: '@beatbax/engine/chips',
    hostKey: 'chips',
    namespaceKey: 'chips',
    exports: [
      'ChipRegistry',
      'chipRegistry',
      'getSongValidationIssues',
      'BUILTIN_CHIP_PLUGINS',
      'gameboyPlugin',
      'nesPlugin',
    ],
  },
  {
    specifier: '@beatbax/engine/parser',
    hostKey: 'parser',
    namespaceKey: 'parser',
    exports: [
      'parse',
      'parseWithPeggy',
      'listTopLevelDefinitions',
      'buildScalePitchClasses',
      'buildLockPitchClasses',
      'canonicalizeRoot',
      'expandChannelNotesWithProvenance',
      'expandChannelTokens',
      'formatScaleLockViolationMessage',
      'normalizeScaleDirective',
      'normalizeLock',
      'noteNameFromExpandedToken',
      'scaleLockViolationKey',
      'validateScaleLocks',
    ],
  },
  {
    specifier: '@beatbax/engine/util/music',
    hostKey: 'util-music',
    namespaceKey: 'util/music',
    exports: [
      'NOTE_SEMITONES',
      'noteToMidi',
      'midiToNote',
      'listInstrumentNoteOptions',
      'midiToFreq',
      'midiToFreqForNote',
      'parseMacro',
      'formatMacro',
      'macroValue',
      'advanceMacro',
      'makeMacroState',
    ],
  },
  {
    specifier: '@beatbax/engine/audio',
    hostKey: 'audio',
    namespaceKey: 'audio',
    exports: [
      'Player',
      'createAudioContext',
      'midiToFreq',
      'noteNameToMidi',
      'parseWaveTable',
      'parseEnvelope',
    ],
  },
  {
    specifier: '@beatbax/engine/export',
    hostKey: 'export',
    namespaceKey: 'export',
    exports: [
      'exportJSON',
      'buildJSON',
      'exportMIDI',
      'buildMIDI',
      'buildUGE',
      'exportUGE',
      'exportWAV',
      'writeWAV',
      'buildWAV',
      'exportWAVFromSong',
      'buildWAVFromSong',
      'quantizeFloatSampleToInt16',
      'readWAV',
      'isExportPayload',
      'normalizeExporterResult',
      'writeExportPayload',
      'ExporterRegistry',
      'exporterRegistry',
      'NOTE_SEMITONES',
      'noteToMidi',
      'midiToNote',
      'midiToFreq',
      'midiToFreqForNote',
      'parseMacro',
      'macroValue',
      'advanceMacro',
      'makeMacroState',
      'BUILTIN_EXPORTER_PLUGINS',
      'jsonExporterPlugin',
      'midiExporterPlugin',
      'ugeExporterPlugin',
      'wavExporterPlugin',
    ],
  },
  {
    specifier: '@beatbax/engine/instruments',
    hostKey: 'instruments',
    namespaceKey: 'instruments',
    exports: [
      'formatInstrumentFieldValue',
      'serializeInstrument',
      'parseInstrumentBody',
      'generateWaveformPreset',
      'samplesToHex',
      'parseWaveHexInput',
      'normalizeWaveSamples',
      'getInstrumentByName',
      'applyInstrumentToEvent',
    ],
  },
  {
    specifier: '@beatbax/engine/patterns',
    hostKey: 'patterns',
    namespaceKey: 'patterns',
    exports: ['expandPattern', 'transposePattern', 'noteToMidi', 'midiToNote'],
  },
  {
    specifier: '@beatbax/engine/sequences',
    hostKey: 'sequences',
    namespaceKey: 'sequences',
    exports: ['expandSequenceItems', 'expandAllSequences'],
  },
  {
    specifier: '@beatbax/engine/scheduler',
    hostKey: 'scheduler',
    namespaceKey: 'scheduler',
    exports: ['createScheduler', 'TickScheduler'],
  },
  {
    specifier: '@beatbax/engine/song',
    hostKey: 'song',
    namespaceKey: 'song',
    exports: [
      'resolveSong',
      'resolveSongAsync',
      'isPanEmpty',
      'parseEffectParams',
      'parseEffectsInline',
      'resolveImports',
      'resolveImportsSync',
    ],
  },
];

const SUPPORTED_ENGINE_SPECIFIERS = new Set(ENGINE_BRIDGE_MODULES.map((mod) => mod.specifier));

export function isSupportedEngineSpecifier(specifier: string): boolean {
  return SUPPORTED_ENGINE_SPECIFIERS.has(specifier);
}

export function supportedEngineSpecifierList(): string {
  return ENGINE_BRIDGE_MODULES.map((mod) => mod.specifier).join(', ');
}

/** ESM bridge that re-exports the renderer's live namespace. `export` is a reserved word, so keys are bracketed. */
export function bridgeModuleSource(mod: EngineBridgeModule): string {
  const lines = [
    `const ns = globalThis.__BEATBAX_ENGINE_HOST__[${JSON.stringify(mod.namespaceKey)}] ?? {};`,
    ...mod.exports.map((name) => `export const ${name} = ns[${JSON.stringify(name)}];`),
    `export default ns[${JSON.stringify('default')}] ?? ns;`,
    '',
  ];
  return lines.join('\n');
}

export function hostBridgeSources(): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const mod of ENGINE_BRIDGE_MODULES) {
    sources[mod.hostKey] = bridgeModuleSource(mod);
  }
  return sources;
}

export const SANDBOX_VALIDATE_HOST = 'sandbox-validate';

export function buildSandboxValidationHtml(entryUrl: string, pluginScheme: string): string {
  let parsed: URL;
  try {
    parsed = new URL(entryUrl);
  } catch {
    throw new Error('Invalid validation entry URL.');
  }
  if (parsed.protocol !== `${pluginScheme}:`) {
    throw new Error('Validation entry must use the plugin scheme.');
  }
  const scriptUrl = `./run.js?entry=${encodeURIComponent(parsed.href)}`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src beatbax-host: beatbax-plugin:; connect-src beatbax-host: beatbax-plugin:;">
</head>
<body>
<script type="module" src="${scriptUrl}"></script>
</body>
</html>
`;
}

/**
 * Runs inside the sandboxed validation window.
 * Loads the real browser-safe host engine APIs, then imports the plugin entry.
 */
export function buildSandboxValidationScript(): string {
  const engineHostUrl = `beatbax-host://${SANDBOX_VALIDATE_HOST}/engine-host.js`;
  return `try {
  await import(${JSON.stringify(engineHostUrl)});
  const entry = new URL(import.meta.url).searchParams.get('entry');
  if (!entry || !entry.startsWith('beatbax-plugin:')) {
    throw new Error('Validation entry must use the plugin scheme.');
  }
  const mod = await import(entry);
  const plugin = mod && (mod.default ?? mod);
  const aliases = plugin && Array.isArray(plugin.aliases)
    ? plugin.aliases.filter((alias) => typeof alias === 'string' && alias.trim())
    : [];
  globalThis.__BEATBAX_PLUGIN_VALIDATE_RESULT__ = {
    ok: true,
    name: plugin && typeof plugin.name === 'string' ? plugin.name : null,
    aliases,
    hasCreateChannel: Boolean(plugin && typeof plugin.createChannel === 'function'),
    isObject: Boolean(plugin && typeof plugin === 'object'),
  };
} catch (error) {
  globalThis.__BEATBAX_PLUGIN_VALIDATE_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
`;
}
