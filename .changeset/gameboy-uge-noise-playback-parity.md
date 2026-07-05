---
"@beatbax/engine": minor
---

Game Boy hUGETracker noise playback parity via `uge_note` and calibrated PCM/WebAudio output levels.

- Add `noiseNote.ts` with hUGEDriver-compatible helpers: `hugeTrackerNoteToIndex`, `getNotePoly`, `resolveNoiseClock`, bipolar LFSR sampling, and `NOISE_OUTPUT_GAIN` (0.25).
- Derive noise NR43 LFSR clock from `uge_note` during BeatBax playback (WebAudio and CLI/WAV), not only on UGE export; optional explicit `divisor`/`shift` still override for tests.
- Wire shared noise clock and gain into `pcmRenderer.ts`, `noise.ts`, and `plugin.ts`; use dual-mono center pan in PCM export to match hUGETracker stereo WAV levels.
- Add `PULSE_OUTPUT_GAIN` (0.5) in `pulse.ts` and apply in `renderPulse` / `playPulse` so pulse kicks align with hUGE mix levels in full-kit renders.
- Share `hugeTrackerNoteToIndex` with `ugeWriter.ts` for consistent `uge_note` parsing on export.
- Update Game Boy editor hover docs for `uge_note` playback behavior.
- Add regression tests: `gameboy/noiseNote.test.ts`, `gbUgeNoteDemo.test.ts`, `gbPercussionDemo.test.ts` (including hUGE reference WAV parity checks), and `gameboy/pulseGain.test.ts`.
