# @beatbax/engine

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
