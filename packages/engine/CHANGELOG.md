# @beatbax/engine

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
