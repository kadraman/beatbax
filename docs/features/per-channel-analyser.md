---
title: "Per-channel Analyser (WebAudio)"
status: planned
authors: ["GitHub Copilot","kadraman"]
created: 2026-03-31
issue: ""
---

Goals
- Provide real per-channel time-domain waveform data to the web UI so the `ChannelMixer` and other visualizers can render faithful waveforms and levels.
- Make the feature optional and opt-in (feature flag / runtime toggle) to avoid unnecessary CPU/memory overhead for users who don't need visuals.
- Keep backward compatibility: when analysers are disabled the UI falls back to the current synthetic pulse visuals.

Non-goals
- Streaming captured audio off-host or persisting raw PCM outside browser memory.
- Changing the audible audio routing or adding audio effects.

Motivation / Background
- The `ChannelMixer` currently draws synthetic mini-waveforms based on playback events ([apps/web-ui/src/panels/channel-mixer.ts](apps/web-ui/src/panels/channel-mixer.ts)).
- The engine `Player` emits position metadata but does not expose continuous per-channel PCM or analyser data ([packages/engine/src/audio/playback.ts](packages/engine/src/audio/playback.ts)).
- Accurate per-channel visuals are valuable for debugging, developer feedback and a richer UX; adding analyser nodes enables this without changing audible output.

High-level design

- Engine-side (browser runtime path): create one `AnalyserNode` per logical channel output (pulse1, pulse2, wave, noise) and sample them at a controlled rate; emit compact, throttled buffers to consumers.
- UI-side: `ChannelMixer` subscribes to `playback:channel-waveform` events (or polls a `getChannelAnalyserData()` getter) and renders smoothed waveforms into the existing canvas elements.
- Feature flag / runtime toggle: default off; opt-in via `PlaybackManager`/Player options and an UI toggle persisted in localStorage (`bb-channel-waveforms`).

Engine changes (concrete)

- Add a Player option: `enablePerChannelAnalyser?: boolean` (default: false).
- When enabled, for each logical channel, create an `AnalyserNode` and insert it into the per-channel node chain where it receives the final channel signal (before master mix).
- Configure sensible defaults (configurable):
  - `analyser.fftSize = 512`
  - `analyser.smoothingTimeConstant = 0.6`
  - `uiUpdateHz = 30` (default emission rate)
- Maintain a single reusable Float32Array per channel sized to `analyser.fftSize`.
- Sampling loop:
  - On a throttled timer (e.g., `setInterval` or a small RAF-driven loop guarded by inactivity), call `analyser.getFloatTimeDomainData(buf)`.
  - Downsample/decimate or quantize to a smaller point count (e.g., 128) before emitting to reduce memory and event payloads.
- Emit an event on the engine `eventBus`: `playback:channel-waveform` with payload: `{ channelId, timestamp, samples, format, sampleCount, sampleRateHint }`.
- Expose a getter: `player.getChannelAnalyserData(channelId)` returning the most-recent buffer and metadata for pull-based UI consumers.

Alternative / Worklet option

- For higher fidelity and more deterministic capture, implement an `AudioWorkletProcessor` that captures PCM and posts frames via `port.postMessage` to the main thread. This offloads sampling to the audio thread and avoids main-thread jitter.
- Tradeoffs: additional complexity, packaging the worklet source, and message-passing overhead. Recommend starting with `AnalyserNode` prototype first.

Event contract (engine → UI)

- Event: `playback:channel-waveform`
- Payload:
  - `channelId: string | number`
  - `timestamp: number` (ms since epoch)
  - `samples: ArrayBuffer | number[]` (prefer typed arrays)
  - `format: 'float32' | 'int8'`
  - `sampleCount: number`
  - `sampleRateHint: number` (e.g., `audioCtx.sampleRate`)
- Emission rate: configurable `uiUpdateHz` (default 30). Engine must drop frames if consumer is slow.

UI integration

- Consumers: `ChannelMixer` ([apps/web-ui/src/panels/channel-mixer.ts](apps/web-ui/src/panels/channel-mixer.ts)) and any future visualizers.
- Two integration patterns supported:
  1. Event-driven: subscribe to `playback:channel-waveform` and render received `samples` buffers.
  2. Pull-based: call `playbackManager.getChannelAnalyserData(channelId)` on a UI-driven timer (e.g., 30Hz) and draw the returned buffer.
- Rendering guidance:
  - Decimate samples to canvas width and draw a smoothed quadratic path.
  - Throttle UI updates to 30 FPS or lower; avoid redrawing when data hasn't changed.
  - Keep canvas dimensions small (128–256px width) and reuse ImageBitmap/paths when possible.
  - Fallback to existing synthetic pulse visuals when analyser data is unavailable.

Configuration & feature flags

- Engine-side option: `playerOptions.enablePerChannelAnalyser`.
- UI-side toggle: `bb-channel-waveforms` localStorage key; persist per-user preference.
- Provide presets: `default`, `low-power` (lower `uiUpdateHz` and smaller sample count).

Performance considerations & recommended defaults

- Defaults to keep cost moderate:
  - `fftSize`: 512
  - `uiUpdateHz`: 30
  - emitted samplePoints: 128 (downsampled)
  - `smoothingTimeConstant`: 0.6
- Use one reusable buffer per channel to avoid allocation churn.
- Pause sampling when the document is hidden (Page Visibility API) to reduce battery usage.
- Provide a low-power mode for mobile devices (e.g., `uiUpdateHz = 10`, emitted points = 64).

Security & privacy

- Clarify in docs that the analyser captures internal engine audio only; it does not access microphone input.
- No audio data is transmitted off-device by default. If future telemetry is added, require explicit opt-in and redaction.

Testing & QA

- Unit tests:
  - Player creates analysers only when enabled.
  - `getChannelAnalyserData` returns buffer of expected length and metadata.
  - Event emission is throttled to `uiUpdateHz` and drops frames if consumer is slow.
- Integration tests:
  - Mock `playback:channel-waveform` events for `ChannelMixer`, assert render pipeline works (decimation, smoothing).
  - Perf tests: measure CPU usage on desktop and mobile at defaults and in low-power mode.

Rollout plan

1. Spec + API: land this feature doc and the minimal API surface (options + events), default off.
2. Engine prototype: implement analyser creation and throttled emission with conservative defaults (`uiUpdateHz = 5`) for early testing.
3. UI hook: wire `ChannelMixer` to events; provide a UI toggle persisted in localStorage.
4. Perf tuning: increase `uiUpdateHz` and sample points based on profiling; add low-power preset for mobile.
5. Ship: enable by default only after sufficient profiling and opt-in telemetry (if any).

Developer checklist

- [ ] Add `enablePerChannelAnalyser` option to `Player` / `PlaybackManager`.
- [ ] Create `AnalyserNode` per channel and wire into audio graph (only when enabled).
- [ ] Implement sampling loop with decimation and event emission.
- [ ] Add `getChannelAnalyserData(channelId)` getter to Player API.
- [ ] Add a simple UI toggle and `ChannelMixer` consumer to render real waveforms.
- [ ] Add unit and integration tests plus a perf benchmark page.
- [ ] Document feature and usage in `docs/features` (this file).

Example pseudocode

```ts
// engine: setup
if (opts.enablePerChannelAnalyser) {
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  channelNode.connect(analyser);
  analyser.connect(masterGain); // or analyser sits in parallel depending on routing
  const buf = new Float32Array(analyser.fftSize);
  setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const dec = decimate(buf, 128);
    eventBus.emit('playback:channel-waveform', { channelId, samples: dec, format:'float32', timestamp: Date.now(), sampleRateHint: audioCtx.sampleRate });
  }, 1000 / uiUpdateHz);
}

// ui: consumer
eventBus.on('playback:channel-waveform', ({ channelId, samples }) => {
  const canvas = findCanvasForChannel(channelId);
  drawSmoothedWave(canvas, samples);
});
```

Notes & open questions

- Where exactly to attach the analyser in the engine graph so it captures the intended per-channel signal (pre/post channel effects) — rely on existing per-channel routing in `packages/engine/src/audio/playback.ts`.
- Decide whether the analyser `connect()` should feed into master mix or be tee'd; prefer tee (connect analyser in parallel) so it doesn't alter audio flow.
- Worklet path: evaluate only if analyser prototype shows jitter or if the main-thread sampling proves insufficient on target devices.

References
- `ChannelMixer` UI: [apps/web-ui/src/panels/channel-mixer.ts](apps/web-ui/src/panels/channel-mixer.ts)
- Engine playback: [packages/engine/src/audio/playback.ts](packages/engine/src/audio/playback.ts)
