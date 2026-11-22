# Research: WebAudio vs PCM effect coverage (112)

| Effect | WebAudio pulse | WebAudio wave | WebAudio noise | PCM pulse | PCM wave | PCM noise |
|--------|----------------|---------------|----------------|-----------|----------|-----------|
| vib | yes (LFO→freq) | yes (LFO→rate) | via nodes | yes (kernel) | yes (kernel continuous LFO) | warn / ignore |
| arp | yes | yes | — | yes | yes (added 112) | warn / ignore |
| port | yes (held voice 110) | yes (playbackRate ramp) | — | yes (kernel exp) | yes (kernel linear) | — |
| trem | yes | yes | — | yes | yes | — |
| bend | yes | yes | — | yes | yes | — |
| sweep | yes | yes | — | yes | yes | — |
| volSlide | yes | yes | — | yes | yes | — |
| cut | yes | yes | — | yes | yes (added 112) | — |
| echo | yes (DelayNode) | yes | yes | yes (buffer delay 112) | yes | — |
| retrig | yes (reschedule) | yes | yes | yes (expand 112) | yes | partial |

## Chromium Offline vs PCM (2026-11 measurement)

Superseded as an acceptance method on 2026-11-22. Spec SC-001 uses per-note level, pitch track, envelope, band energy through 16 kHz, and full-mix RMS. The numbers below are historical. They bypassed the master limiter and used windowed correlation, which two WebAudio renders of the same song also fail.

Authority at the time: Chromium `OfflineAudioContext` + `Player` via `packages/engine/scripts/capture-webaudio-ref.mjs` (not `node-web-audio-api`). Capture bypasses DynamicsCompressor. Compare uses DC-block + mild low-pass, then **active-region windowed** correlation (0.1 s windows, both sides RMS ≥ 0.01) with ±50 ms lag search.

### `tutorial_groove.bax` @ 44100 Hz (after PCM fixes)

| Stem | Windowed corr | Full-buffer best corr | Notes |
|------|---------------|----------------------|--------|
| ch3 wave+port | **0.94** | 0.94 | Was ~0.08 before phase-reset + `WAVE_PLAYBACK_GAIN` |
| ch1 pulse+vib | **0.90** | 0.39 | Phase reset; vib windowed OK |
| ch2 pulse+arp | **0.74** | 0.79 | Residual arp/duty=25 gap — follow-up |
| ch4 noise | **0.62** | 0.86 | Stochastic LFSR — gate on RMS, not corr |
| full mix | **0.68** | 0.55 | Dragged by ch2/ch4 |

### Isolated baselines

| Fixture | Windowed | Full |
|---------|----------|------|
| pulse_plain | 0.97 | 0.94 |
| pulse_melody (short notes) | 0.91 | 0.46 |
| pulse_vib | 0.93 | 0.73 |
| pulse_arp | 0.83 | 0.80 |
| wave_plain | 0.98 | 0.98 |
| wave_port | 0.85 | 0.84 |

### Fixes applied from this matrix

1. **Wave level** — PCM now applies `WAVE_PLAYBACK_GAIN` (0.6) after the ±0.9 AC buffer, matching WebAudio `playWavetable`.
2. **Phase reset** — PCM pulse/wave reset carrier (+ vib LFO) phase on non-legato / non-port notes, matching new OscillatorNode / BufferSource per note.
3. **Vib LFO** — advance phase only while vib is active (after delay); amp from note `baseFreq`; order port→arp→bend→vib.
4. **GB envelope** — PCM linearly interpolates between envelope steps (`setValueCurveAtTime` behaviour).
5. **Arp frames** — `arpSemitoneAt` uses `floor(t * frameRate)` like WebAudio step schedule.
6. **Parity capture** — Chromium Offline; `bypassMasterLimiter`; iterative `flushAll`.

### Residual / follow-ups

- The windowed-correlation residuals (including ch2 arp at ~0.74) are not open defects. Re-measure with SC-001. CLI play and WAV stay on PCM.

**Offline path:** There is no Node Offline WebAudio WAV export. Node `node-web-audio-api` is not the parity oracle.
