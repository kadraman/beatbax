---
"@beatbax/engine": minor
"@beatbax/cli": patch
"@beatbax/plugin-chip-sms": patch
---

Web Audio loudness, clipping prevention, chip-aware meters, and CLI/web-ui WAV export parity.

### @beatbax/web-ui _(not versioned — local app)_

- **Master volume** default remains 100% for new users; remove persisted NES Web Audio mix-mode setting and startup `setNesWebAudioMixMode()` call.
- **Chip-aware meters**: add `meter-display.ts`; scale channel-mixer VU and song-visualizer waveforms via `ChipPlugin.getMeterDisplayGain()` (NES and SMS).
- **WAV export**: route through shared `writeWAV()` from `@beatbax/engine/export`; add `pcm-export-warnings.ts` for NES per-note effects omitted from PCM (echo/retrig/vib/port/arp/bend/trem/cut).
- **Settings**: remove NES hardware/normalized mix-mode toggle from plugin settings.
- Tests for meter display, PCM export warnings, and engine-chips mock `getMeterDisplayGain` support.

### @beatbax/engine

- **Playback loudness**: insert a `DynamicsCompressorNode` master limiter after `masterGain`; rewire output with targeted `disconnect(destination|limiter)` only so parallel UI analyser taps on `masterGain` survive `playAST()` / `setMasterVolume()` restarts.
- **NES Web Audio**: remove `setNesWebAudioMixMode`, `getNesWebAudioMixMode`, `getNesWebAudioNorm`, and `NES_WEB_AUDIO_NORM`; use hardware `NES_MIX_GAIN` weights only in pulse/triangle/noise/DMC backends.
- **Chip plugin API**: add optional `getMeterDisplayGain(channelIndex)` on `ChipPlugin`; implement on built-in NES plugin for meter UI compensation.
- **PCM / WAV parity**: `renderSongToPCM()` uses `song.bpm` when caller omits BPM; shared `quantizeFloatSampleToInt16()` (`Math.floor`) in `writeWAV()`; NES pulse/triangle Web Audio oscillators use default `createPeriodicWave` normalization (matches PCM).
- **CLI Node playback**: add `peakLimitForPlayback()` in `playbackLimiter.ts`; export from `@beatbax/engine/node`; apply before int16 output in `nodeAudioPlayer`.
- Regression tests for BPM rendering, WAV quantization, playback limiter, master-volume limiter wiring, and analyser mock `createDynamicsCompressor` support.

### @beatbax/cli

- Change `--play-gain` default from **0.6** to **1.0** (peak-limited via engine `playbackLimiter`); update DMC preview playback gain default to match.

### @beatbax/plugin-chip-sms

- **Loudness parity**: remove `setSmsWebAudioMixMode`, `getSmsWebAudioMixMode`, `getSmsWebAudioNorm`, and the Web-Audio-only 0.7× normalization; unify PCM and Web Audio on `SMS_MIX_GAIN`.
- Retune `SMS_MASTER_GAIN` for ~0.85 headroom when all four channels play at max attenuation (prevents web-ui clipping on dense arrangements).
- Add `getMeterDisplayGain()` for tone (ch 0–2) and noise (ch 3) channels.
- Export `SMS_TARGET_PEAK` and `SMS_MASTER_GAIN` from the plugin entry point.
- Tests for full-arrangement peak target and meter display gain values.
