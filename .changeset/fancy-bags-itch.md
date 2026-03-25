---
"@beatbax/engine": minor
---

feat(engine): portamento legato gain + per-event position metadata

- port effect: suppress envelope re-attack across consecutive portamento
  notes; track GB gain level between notes using computeLegatoEndGain()
- pulse.ts: read __portamento_legato__ flags in gain scheduling helpers
  (applyGainStart/applyGainEnd) to continue envelope smoothly on legato runs
- Fix port reading osc._baseFreq instead of osc.frequency.value to work
  correctly in browser AudioContext (not just standardized-audio-context)
- resolver: attach sourceSequence, sourcePattern, barNumber metadata to
  every ChannelEvent via buildTokenPatternMeta() + getLeafPats() tree walk
- resolver: pass baseFilePath/searchPaths through to importResolver in
  both sync and async paths (browser and Node variants)
- Fix named instrument tokens not updating currentInstName to prevent
  instrument bleed after percussion hits
