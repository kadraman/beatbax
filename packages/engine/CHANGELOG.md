# @beatbax/engine

## 0.22.0

### Minor Changes

- df35782: Add Game Boy instrument programs that lower macros and native `subpat` into a shared tick IR for preview/WAV and hUGETracker UGE instrument subpatterns.
  - Support `pitch_env` / `vol_env` / `duty_env` / `arp_env` and native `subpat` (`jump:`, `vol:`, `timbre:`, `fx:`, `halt`, empty rows) on `chip gameboy`.
  - Drive pulse/noise WebAudio and PCM from the same tick program as UGE export (`lowerGameBoyInstrumentProgram`).
  - Encode/decode UGE v6 subpattern rows; one-shot macros halt so they do not auto-loop.
  - Clamp tick offsets and `jump:` targets to UGE-representable ranges (with warnings) so preview and export stay aligned.
  - Cache tick timelines / cursors for O(1) per-tick playback on long held notes.
  - Retune pulse mix gain for closer hUGETracker WAV parity on sustained tones.
  - Apply wave instrument `volume=` in WebAudio preview (parity with PCM/UGE).

### Patch Changes

- ca6b803: Reject insecure remote DMC sample URLs in `resolveDMCSample()` so remote sample loading stays consistent with the desktop allowlist policy.
  - `http://` sample references are now rejected as unsupported.
  - Remote sample URLs with embedded credentials or explicit ports are also rejected by desktop policy.
  - Existing `https://`, `github:`, `local:`, and `@nes/` sample behavior is unchanged.

## 0.21.1

### Patch Changes

- 375c166: Improve unknown-keyword parse errors and include `effect` in the valid keyword list.
  - Centralise `VALID_KEYWORDS` and `unknownKeywordMessage()` so Peggy recovery and error enhancement report the same keyword list (including `effect`, `song`, and `import`).
  - Avoid mislabeling malformed `effect` lines as unknown top-level keywords.
  - Add `parser.effect-syntax-error.test.ts` regression coverage.

- 81dc4ef: Fix inline effect parameter parsing and comma-chained preset validation.
  - **Positional empty parameters**: `parseEffectParams()` now preserves skipped slots (e.g. `vib:6,5,,2` keeps the default waveform and applies `durationRows` on the 4th param instead of collapsing values into earlier positions).
  - **Shared `effectsInline` module**: deduplicated `parseEffectParams` / `parseEffectsInline` from `resolver` and `resolver.browser` into `song/effectsInline.ts` for use by the parser and resolver.
  - **Comma-chained preset effects**: undefined-effect validation parses the full inline effect body so chains like `<exprVib,pan:R>` no longer false-positive when a defined preset is followed by `pan`.
  - Add regression tests for positional vibrato params, preset+pan chains, and effect-param parsing.

## 0.21.0

### Minor Changes

- 7ef507c: Game Boy hUGETracker noise playback parity via `uge_note` and calibrated PCM/WebAudio output levels.
  - Add `noiseNote.ts` with hUGEDriver-compatible helpers: `hugeTrackerNoteToIndex`, `getNotePoly`, `resolveNoiseClock`, bipolar LFSR sampling, and `NOISE_OUTPUT_GAIN` (0.25).
  - Derive noise NR43 LFSR clock from `uge_note` during BeatBax playback (WebAudio and CLI/WAV), not only on UGE export; optional explicit `divisor`/`shift` still override for tests.
  - Wire shared noise clock and gain into `pcmRenderer.ts`, `noise.ts`, and `plugin.ts`; use dual-mono center pan in PCM export to match hUGETracker stereo WAV levels.
  - Add `PULSE_OUTPUT_GAIN` (0.5) in `pulse.ts` and apply in `renderPulse` / `playPulse` so pulse kicks align with hUGE mix levels in full-kit renders.
  - Share `hugeTrackerNoteToIndex` with `ugeWriter.ts` for consistent `uge_note` parsing on export.
  - Update Game Boy editor hover docs for `uge_note` playback behavior.
  - Add regression tests: `gameboy/noiseNote.test.ts`, `gbUgeNoteDemo.test.ts`, `gbPercussionDemo.test.ts` (including hUGE reference WAV parity checks), and `gameboy/pulseGain.test.ts`.

- 542a091: Payload-first export architecture for built-in formats (JSON, MIDI, UGE, WAV).
  - Add payload builders: `buildUGE`, `buildJSON`, `buildMIDI`, `buildWAV`, and `buildWAVFromSong` for in-memory export without filesystem side effects.
  - Add `ExportPayload` type plus `normalizeExporterResult()`, `isExportPayload()`, and `writeExportPayload()` helpers for CLI and UI adapters.
  - Document payload-first `ExporterPlugin` behavior: return `string`, `Uint8Array`, `ArrayBuffer`, or `ExportPayload` when `outputPath` is omitted; keep path-writing wrappers (`exportJSON`, `exportMIDI`, `exportUGE`, `exportWAVFromSong`) for Node/CLI workflows.
  - Update built-in `json`, `midi`, `uge`, and `wav` exporter plugins to return downloadable payloads when called without `outputPath`.
  - Refactor `exportJSON`, `exportMIDI`, and `exportUGE` file writers to use dynamic `fs` imports where appropriate; `exportWAVFromSong` delegates rendering to `buildWAVFromSong`.
  - Export new symbols from `@beatbax/engine/export` and `plugin-api.ts`.
  - Add regression tests in `export-payload.test.ts`, `export-builders.test.ts`, and extended `ugeExport.test.ts`.

## 0.20.2

### Patch Changes

- cdddca3: Improve Game Boy UGE export compatibility and authoring clarity.

  UGE export now supports `uge_note` on named Game Boy noise instruments using hUGETracker display notation, converts BeatBax flat notes to hUGETracker sharp equivalents with export warnings, and accepts 32-nibble hUGETracker hex strings in Game Boy wave validation. Game Boy example songs and docs were updated to use explicit `uge_note` values, add a focused `gb_uge_note_demo.bax`, and improve hUGETracker-friendly timing for affected Game Boy songs. Editor metadata and hover help now include the new `uge_note` property.

- cdddca3: Fix SMS note-cut clicks by preserving scheduled gain levels when applying cut effects.

  SMS WebAudio gain scheduling now records envelope metadata so the engine cut effect can ramp down from the actual scheduled gain instead of jumping to the AudioParam default value.

- cdddca3: Standardize chip platform profile configuration across the engine and chip plugins.

  The engine now exposes a typed `ChipSongContext` and optional `ChipPlugin.configureForSong()` hook, and playback/PCM rendering call the hook without `any` casts. Spectrum/CPC platform selection is aligned around `chip cpc` / `chip amstrad-cpc` aliases, while SMS and NES keep their `pal` / `ntsc` region qualifiers. UI hints, validation, docs, and regression tests were updated to match the new author-facing syntax.

## 0.20.1

### Patch Changes

- 7ad1850: Allow local file imports in Electron/desktop contexts when filesystem access is available via `window.electronAPI` or explicit `readFile`/`fileExists` options.

## 0.20.0

### Minor Changes

- b4be200: Web Audio loudness, clipping prevention, chip-aware meters, and CLI/web-ui WAV export parity.
  - **Playback loudness**: insert a `DynamicsCompressorNode` master limiter after `masterGain`; rewire output with targeted `disconnect(destination|limiter)` only so parallel UI analyser taps on `masterGain` survive `playAST()` / `setMasterVolume()` restarts.
  - **NES Web Audio**: remove `setNesWebAudioMixMode`, `getNesWebAudioMixMode`, `getNesWebAudioNorm`, and `NES_WEB_AUDIO_NORM`; use hardware `NES_MIX_GAIN` weights only in pulse/triangle/noise/DMC backends.
  - **Chip plugin API**: add optional `getMeterDisplayGain(channelIndex)` on `ChipPlugin`; implement on built-in NES plugin for meter UI compensation.
  - **PCM / WAV parity**: `renderSongToPCM()` uses `song.bpm` when caller omits BPM; shared `quantizeFloatSampleToInt16()` (`Math.floor`) in `writeWAV()`; NES pulse/triangle Web Audio oscillators use default `createPeriodicWave` normalization (matches PCM).
  - **CLI Node playback**: add `peakLimitForPlayback()` in `playbackLimiter.ts`; export from `@beatbax/engine/node`; apply before int16 output in `nodeAudioPlayer`.
  - Regression tests for BPM rendering, WAV quantization, playback limiter, master-volume limiter wiring, and analyser mock `createDynamicsCompressor` support.

## 0.19.1

### Patch Changes

- d500a1e: Web UI song-editing polish: chip-aware instrument hovers, MIDI idle preview, editor UX improvements, and parser validation fixes.
  - Add NES `hoverDocs` entries for `type`, `duty`, and `vol` (keyword hovers in the web editor).
  - **Parser:** resolve unknown `chip` via `chipRegistry.has()` and skip Game Boy instrument validation when the chip is unknown, avoiding misleading cascade errors (e.g. NES-only types flagged on a typo'd chip name).
  - Regression test: unknown chip reports only the chip error, not spurious instrument type/property warnings.
- Remove NES WebAudio mix-mode API (`setNesWebAudioMixMode`, `getNesWebAudioMixMode`, `getNesWebAudioNorm`) and keep NES WebAudio output hardware-scaled only.

## 0.19.0

### Minor Changes

- 004f40d: Move the NES Ricoh 2A03 APU into `@beatbax/engine` as a built-in chip alongside Game Boy.
  - Register `nesPlugin` automatically via `BUILTIN_CHIP_PLUGINS`; `chip nes` and `chip famicom` work without a separate plugin install.
  - Add `@beatbax/engine/chips/nes` package export for NES utilities (period tables, DMC encode/decode, channel backends, validation).
  - Move NES implementation and tests from the former standalone plugin into `packages/engine/src/chips/nes/` and `packages/engine/tests/nes/`.
  - Parser chip-region diagnostics mention `chip famicom` where relevant.

## 0.18.0

### Minor Changes

- a115c2c: Export `getSongValidationIssues()` for chip plugins’ optional `validateSong()` hook; add `SongValidationContext` and `validateSong?` on `ChipPlugin`.
  - Shared inline render effects (`applyInlineRenderEffects`) for `arp_env`, `pitch_env`, and `noise_rate_env` in playback and PCM render; optional `prepareNoteRender` on channel backends.
  - `ChipConsoleVariant` / `buildHelpSections` for multi-console New Song Wizard and variant-aware help; `ChipHelpContext` with `chip` / `chipRegion`.
  - Parser: additional chip aliases and chip directive handling for Spectrum targets.

## 0.17.0

### Minor Changes

- 7dfccea: Deprecated time and ticksPerStep in favor of stepsPerBar.
- b6e80c9: Add advanced modifier support in the engine pipeline and exports.
  - Parser/AST and structured parsing updates for advanced modifiers.
  - Sequence/expansion and resolver updates to apply advanced modifier behavior deterministically.
  - UGE writer and related effect/audio utility updates for modifier-aware export/runtime behavior.
  - Regression and feature tests for advanced modifiers and arpeggio offset handling.

- b739513: Remove the `arrange` directive and its `defaults(...)` modifier from the BeatBax language.
  - Parser, AST, and resolver no longer accept or expand `arrange` blocks.
  - Multi-channel layouts use `channel` mappings with comma-separated `seq` items (see `songs/features/sequence_demo.bax`).
  - Songs that used `arrange` must be migrated before they will parse.

- 738e2e3: Add tier-2 sequence modifiers and harden modifier parsing and expansion.
  - **Tier-2 modifiers** in `refExpander`, structured parsing, and AST: `invert`/`inv`, `every(N,MOD)`, `off(N)`/`lag(N)`, `pick(...)`, `chunk(N)`, and `shuffle(seed)`. Modifiers chain left-to-right with colons (e.g. `lead_core:rot(1):lag(1)`).
  - **`every(N,MOD)`** applies only token-local inner modifiers: requires exactly one output token and rejects `inst`/`pan` overrides; warns and leaves the token unchanged otherwise.
  - **Peggy grammar** for modifier arguments allows one level of nested parentheses (e.g. `every(2,oct(+1))`); deeper nesting is not supported and no longer mis-parsed as a truncated body.
  - **Demo and tests**: rework `songs/features/advanced_modifiers_demo.bax` with a playable arrangement plus `demo_*` reference seqs; add `modifier-chain`, `tier2-modifiers`, and parser regression coverage.

### Patch Changes

- 13e278f: Log Node audio fallback failures before continuing to the next playback backend, and ensure runtime failures in `speaker` and `play-sound` correctly fall through to the system player.
- 115eacb: Improve Peggy parser diagnostics for mistyped sequence transforms, including better suggestions and locations, and update CLI test resolution to use local engine TypeScript sources reliably.
- e195402: Fix to prevent multiple channels with the same number being used.
- 2b6bbbe: Improve WAV-to-DMC conversion correctness, validation, and paste-safe output.
  - NES DMC encoding:
    - Removed unintended global NES clock-region mutation during encoding.
    - Capped pre-resample and resampled working lengths from maxBytes and rateHz to avoid unnecessary work on long inputs.
    - Reused shared greedy DMC bit-selection logic to remove duplicated encoder logic.
    - Tightened emitted instrument-name sanitization to match identifier rules (no leading digits).
    - Made emitted local sample refs paste-safe by percent-encoding spaces and decoding on load.
  - CLI wav2dmc:
    - Fixed -q/--rate alias precedence over defaulted --dmc-rate.
    - Changed --dmc-rate handling to reject invalid, non-integer, or out-of-range values instead of silently clamping/defaulting.
    - Added integration coverage for invalid rate inputs and spaced output paths in --emit-inst output.
  - Engine WAV reader:
    - Fixed truncated data-chunk handling to size output by bytes actually present, avoiding silent zero-padded tails.
    - Added focused wavReader truncation regression tests.

## 0.16.0

### Minor Changes

- accf3b7: Removed async chip-exporter auto-resolution and standardized explicit exporter registration.
  Chip plugins should register exporters via exporterPlugins (or host/CLI registration), not runtime resolve hooks.
  Also includes web-ui build warning cleanup and feature/spec documentation alignment.

## 0.15.0

### Minor Changes

- 7bbd4a7: Expose `midiToFreqForNote` through the engine public API and update the VGM exporter to use the consolidated engine utilities. Tighten the exporter’s engine peer range accordingly and add regression coverage for the shared music utility contract and VGM backend behavior.

## 0.14.0

### Minor Changes

- 399ca71: Split engine runtime entrypoints and move Node playback internals into engine Node API.
  - Add @beatbax/engine/node with playFile, playAudioBuffer, and Node runtime helpers.
  - Move nodeAudioPlayer ownership from CLI into engine and update CLI to consume engine Node APIs.
  - Keep CLI command behavior the same while removing internal engine-to-CLI runtime coupling.
  - Update docs and tests for the runtime boundary and Node playback fallback behavior.

## 0.13.2

### Patch Changes

- b6ce433: Refactor shared music utilities into the engine and expose them through the plugin API, then migrate chip/exporter packages to consume the centralized utilities. Improve VGM exporter backend behavior and alias handling, including normalized SN76489-family chip alias validation consistency (for example underscore/hyphen variants), plus regression coverage and SN76489 flush behavior documentation clarification.
- 72bbd57: added chip name normalization and proper region checking in parser

## 0.13.1

### Patch Changes

- 38fe1e5: Extract Game Boy New Song wizard metadata/templates into a dedicated `songWizard` module and wire it through the built-in Game Boy plugin via `newSongWizard`.

  Keep Game Boy `ui-contributions` focused on editor prompt/hover/help content while preserving chip-aware New Song onboarding defaults.

## 0.13.0

### Minor Changes

- dc5c6ab: Added inline macro effect support and fixed portamento frequency seeding.
  - `parseEffectParams` now splits on top-level commas only, preserving bracketed inline macro payloads (e.g. `pitch_env:[0,2,0,-2,0]`). Previously, bracketed arrays were incorrectly split.
  - Added `pitch_env` (inline pitch envelope macro) and `vol_env` (inline volume envelope macro) effect handlers in the effects registry.
  - Fixed portamento (`port` effect) to correctly seed the starting frequency from the previous note using `_prevFreq`, fixing cases where portamento began from the wrong frequency when the preceding note did not also use `port`.
  - Playback engine now tracks the last played frequency per channel (`_lastNoteFreqByChannel`) and seeds it onto oscillator nodes before effects are applied.
  - Inline instrument-property effects (`noise_rate_env`, `vol_env`) are now merged into the effective instrument before `createPlaybackNodes` is called, enabling chip plugins to receive them.

## 0.12.0

### Minor Changes

- b25cd91: Added chip region qualifier and per-chip effect dispatch to the core engine.
- b25cd91: Parser: `chip <name> ntsc|pal` region token is now parsed and validated; accepted for `chip sms` and `chip nes`; invalid regions and unsupported chips produce descriptive diagnostics with typo hints
- b25cd91: AST: new optional `chipRegion` field on the root AST node and in the JSON Schema
- b25cd91: SongModel / resolvers: `chipRegion` propagated through resolver.ts and resolver.browser.ts into SongModel
- b25cd91: ChipPlugin interface: new optional `effects` field (Record<string, EffectHandler>) for chip-specific effect overrides
- b25cd91: Effect dispatch: playback.ts and pcmRenderer.ts resolve effect handlers from the active chip plugin first, then fall back to the global registry — prevents SMS/NES plugin effects from overriding Game Boy behavior globally
- b25cd91: configureForSong() hook: called by playback.ts and pcmRenderer.ts before play/render, passing { chip, chipRegion } to the active plugin

### Patch Changes

- 962e1a2: updates to gameboy ui contributons and copilot

## 0.11.2

### Patch Changes

- e1dd039: support for master volume override
- b5dcde4: engine: fixed Gameboy instrument volume implementation (always starting at max)
  cli: added additional tests
  ===

## 0.11.1

### Patch Changes

- 09be2ac: Add optional async chip exporter resolution so plugins can dynamically register optional exporter dependencies.

## 0.11.0

### Minor Changes

- d72b0c6: Added instrumentVolumeRange to the ChipPlugin interface, allowing plugins to specify min/max (and attenuation) for instrument volume/envelope fields. The web UI and Channel Mixer now use this for correct scale display.
- d72b0c6: The plugin system is fully implemented: ChipPlugin and ChipChannelBackend interfaces, ChipRegistry for runtime registration/lookup, and UI contribution hooks for plugin-driven web UI.
- d72b0c6: Added listCanonical() and aliasesFor() to ChipRegistry for canonical chip/plugin listing and alias handling.
- d72b0c6: Plugins must now use a src/version.ts file for version constants (no direct package.json import).
- d72b0c6: Dual rendering: melodic channels should implement both render() (PCM) and createPlaybackNodes() (Web Audio).
- d72b0c6: Exporter plugin system is designed (see exporter_plugin_system.md), but core engine still uses built-in exporters.

## 0.10.1

### Patch Changes

- 110f990: Added instrumentVolumeRange to ChipPlugin interface (min/max/isAttenuation) with chip-aware defaults.

## 0.10.0

### Minor Changes

- 30f54a1: updated to use parser error recovery with multi-error reporting changes

## 0.9.0

### Minor Changes

- 7b431d8: Introduced the chip plugin system: new `ChipPlugin` and `ChipChannelBackend` interfaces for third-party chip backends; a global `ChipRegistry` singleton for runtime registration and lookup; the built-in Game Boy APU extracted into a proper `ChipPlugin`; UI contribution hooks for plugin-driven web UI; new `plugin-api.ts` entry point (Jest-safe, no `import.meta`) exporting only the types and objects external plugins need; optional `setFrequency()` method on channel backends for mid-note frequency changes; optional `createPlaybackNodes()` method for full WebAudio effects support on melodic channels.

## 0.8.0

### Minor Changes

- 0874961: implemented per-channel analyser to support actual waveform visualization

### Patch Changes

- 677f0f2: Update pcmRenderer to use 32-nibble 4-bit wavetable by default
- 6817844: expose getAudioContext() and getMasterGain() on Player for UI audio tapping
- 9a42f1e: updated type support for time and stepsPerBar

## 0.7.0

### Minor Changes

- c121a66: - # `playback.ts` - seamless looping refactor
  - # `effects\\index.ts` and `pcmRenderer.ts` - vibrato and tremolo onset delay support
  - `resolver.ts` - effects parameter normalization
  - `ugeWriter.ts` - uge export improvements

## 0.6.0

### Minor Changes

- d1b46be: feat(engine): portamento legato gain + per-event position metadata
  - port effect: suppress envelope re-attack across consecutive portamento
    notes; track GB gain level between notes using computeLegatoEndGain()
  - pulse.ts: read **portamento_legato** flags in gain scheduling helpers
    (applyGainStart/applyGainEnd) to continue envelope smoothly on legato runs
  - Fix port reading osc.\_baseFreq instead of osc.frequency.value to work
    correctly in browser AudioContext (not just standardized-audio-context)
  - resolver: attach sourceSequence, sourcePattern, barNumber metadata to
    every ChannelEvent via buildTokenPatternMeta() + getLeafPats() tree walk
  - resolver: pass baseFilePath/searchPaths through to importResolver in
    both sync and async paths (browser and Node variants)
  - Fix named instrument tokens not updating currentInstName to prevent
    instrument bleed after percussion hits

## 0.5.5

### Patch Changes

- f671c2e: Improved gameboy wave instrument fidelity and added sequence-to-sequence mapping.

## 0.5.4

### Patch Changes

- 5e28635: wave channel effects support and uge export fix

## 0.5.3

### Patch Changes

- fd31436: fix inline instrument changes and vibrato not working

## 0.5.2

### Patch Changes

- f3b1cf9: fix(audio): unify noise channel amplitude across all playback backends

## 0.5.1

### Patch Changes

- carry instrument default note through resolver into UGE export

## 0.5.0

### Minor Changes

- d9653cf: Structured parser diagnostics with error/warning levels

## 0.4.0

### Minor Changes

- bc94574: Added playback position tracking APIs for real-time monitoring of pattern, sequence, and event positions.

## 0.3.0

### Minor Changes

- 94ae630: Implements a production-ready centralized logging system for BeatBax engine and CLI

### Patch Changes

- 94ae630: Updated implementation to match documentation.

## 0.2.0

### Minor Changes

- 348b5df: Add pause/resume support with proper timer management and debug logging.

## 0.1.1

### Patch Changes

- 3d04a3d: Added README documentation
