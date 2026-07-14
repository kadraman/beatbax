---
title: "Performance Mode Video Recording"
status: proposed
authors: ["kadraman"]
created: 2026-07-13
updated: 2026-07-13
related:
  - docs/features/complete/channel-visualizer.md
  - docs/features/complete/per-channel-analyser.md
  - docs/features/complete/electron-desktop-client.md
  - docs/features/complete/cli-audio-export.md
---

## Summary

Add a **desktop-only** ability to record Song Visualizer **performance mode** to a video file (default **MP4 H.264 + AAC**, optional **WebM VP9 + Opus**). Capture is a *clean composite* of background + waveforms (+ optional channel HUD and intro title card) — not a screen grab of mute/solo/toolbar chrome. Encoding uses Chromium **WebCodecs** plus muxers in the Electron renderer (no bundled ffmpeg). Format, quality, title card, HUD, and save location are configurable in Settings.

---

## Problem Statement

Performers and content creators want shareable videos of BeatBax performances (YouTube, social, demos). Today the desktop app can export **WAV** offline via `ExportManager`, but there is no way to capture the live performance visualizer together with what the user hears (including mute/solo and master levels during a take).

Screen recording works poorly here: performance-mode chrome (play/stop/exit) would appear unless auto-hidden perfectly, and OS recorders do not integrate with app settings or song metadata title cards.

---

## Goals

1. Record performance mode on **desktop only** to MP4 (H.264 + AAC) by default, with WebM as an alternate.
2. Produce a **clean** frame: background effect + channel waveforms; no toolbar or mute/solo controls in the file.
3. Optionally flash **song name / artist** as an intro title card for the first few seconds of the recording.
4. Capture **what you hear** from the live Web Audio graph (post-limiter tap), keeping A/V roughly in sync.
5. Expose durable **Settings** for format, resolution, fps, quality, HUD, title card, and save location behavior.
6. Provide a clear entry point from the **normal Song Visualizer toolbar** that kick-starts a **from-start, play-once** performance recording.
7. Keep the performance toolbar lean: Record/Stop (+ optional title-card toggle mirroring Settings).
8. End the take automatically when the song finishes (one playthrough); allow early stop.

---

## Non-Goals (v1)

- Web-ui recording or web Settings section for recording.
- Pixel-perfect DOM / WYSIWYG capture including on-screen controls.
- Offline non-realtime “render song to video” (scheduled engine → frames).
- Custom title-card text editing beyond `song name` / `song artist` metadata.
- End-card / credits overlay.
- Arbitrary numeric bitrate fields (use quality presets).
- Vendor-specific encoder UIs beyond WebCodecs `hardwareAcceleration: 'prefer-hardware'`.

---

## User Experience

### Entry from normal Song Visualizer (primary)

Add a dedicated **Record** control on the normal (non-performance) visualizer toolbar — next to the existing performance-mode button — so recording is discoverable without first knowing to enter performance mode.

**Kick-start flow:**

1. User clicks **Record** in the normal visualizer toolbar.
2. App enters **performance mode** immediately (full overlay; same layout used for live performance and for clean capture).
3. Transport is forced into a **one-shot take**: seek/restart to the **beginning** of the song, disable looping for the duration of the recording (ignore active Pattern Grid loop range and the transport loop toggle for this session).
4. Recording session starts (codec check → compositor + encoders), then **Play** from the start.
5. When the song reaches its natural end, **stop recording automatically** (finalize + save). User can still stop early via Stop / exit.
6. Toolbar switches to the performance chrome (auto-hiding): **Stop recording**, play/stop, title-card toggle, exit. Loop controls should not re-enable mid-take (or are ignored while recording).

Tooltip should make the behaviour obvious, e.g. “Record performance video from the start (plays once)”.

If the user starts **Record** while already in performance mode (not via the normal-toolbar kick-start), apply the same one-shot rules: restart from beginning, loop off, record until end or Stop.

### Controls while in performance mode

1. Toolbar also exposes **Record** / **Stop** so a take can start after the user has already entered performance mode manually.
2. While recording: red indicator (+ optional elapsed time); chrome still auto-hides for the live view (file never includes that chrome).
3. Stop recording (or exit performance / Esc): finalize muxer and **save** according to Save location settings. Exiting performance while recording always finalizes first.
4. Optional compact **Title card** toggle in the performance toolbar mirrors the Settings atom.

Recording always uses the performance-mode visual composition (vertical channel layout + bg effect). There is no “record the docked panel as-is” path in v1.

### Settings → General → Performance recording

Shown when Song Visualizer is enabled (same gating pattern as visualizer background controls).

Defaults are chosen for a straightforward **YouTube upload** (MP4 H.264 + AAC, 1080p30, higher bitrates). Users can lower quality for smaller files or switch to WebM when preferred.

| Setting | Options | Default |
|--------|---------|---------|
| Format | `mp4` (H.264 + AAC), `webm` (VP9 + Opus) | `mp4` |
| Resolution | `window` (visualizer size, even dims, capped), `720p`, `1080p` | `1080p` |
| Frame rate | `24`, `30`, `60` | `30` |
| Video quality | `low` / `medium` / `high` (bitrate mapped from res) | `high` (~8 Mbps at 1080p30; matches YouTube’s SDR recommendation band) |
| Audio quality | `128` / `192` / `256` kbps | `256` (highest preset; YouTube recommends up to ~384 kbps stereo AAC) |
| Title card | on / off | on |
| Channel HUD in video | on / off (titles / chip / instrument / pattern) | on |
| Save location | `ask`, `last-folder`, `fixed-folder` | `ask` |
| Fixed folder path | directory (when `fixed-folder`) | empty until picked |
| Filename stem | template; supports `{name}` | `{name}-performance` |

#### Save location behavior

- **`ask`:** save dialog every time with `.mp4` / `.webm` filter and suggested filename.
- **`last-folder`:** same dialog; `defaultPath` uses last successful directory; remember dir after save.
- **`fixed-folder`:** user picks a folder once; on stop, write `{stem}-{timestamp}.{ext}` with no dialog (`showDialog: false`). If path missing, fall back to `ask`.

---

## Proposed Design

### Architecture

```text
Settings atoms ──► PerformanceRecorder session
Live bg + wave canvases + HUD text ──► Offscreen composite canvas
                                         │
                                         ▼
                              WebCodecs VideoEncoder
Player output (after limiter) ──► MediaStreamDestination
                                         │
                                         ▼
                              WebCodecs AudioEncoder
                                         │
                         mp4-muxer or webm-muxer
                                         │
                         Electron persistFile / save dialog
```

**Why WebCodecs (not MediaRecorder / ffmpeg):** Electron’s Chromium stack can encode H.264 and AAC reliably enough for desktop v1; muxer libraries produce seekable files; no native binary bundle.

### Clean capture compositor

Do **not** use `getDisplayMedia` / `desktopCapturer` for v1.

Each frame, draw to an offscreen canvas:

1. Background canvas (`#bb-viz-bg`) scaled to output size.
2. Per-channel wave canvases into vertical strips matching live performance layout.
3. If Channel HUD is on: channel title, chip label, instrument, pattern via canvas `fillText`.
4. If Title card is on and `t < ~3.5s`: fade-in / hold / fade-out overlay with name + artist.

Omit toolbar, mute/solo, and cursor. Even dimensions required for H.264; clamp `window` resolution to max 1920×1080.

### Title card

- **Title:** `ast.metadata.name`; else file basename; else `"Untitled"`.
- **Artist:** `ast.metadata.artist`; omit line if empty.
- Timing: fade in ~0.6s → hold → fade out ~0.8s over a subtle dark scrim.
- Baked into the composite so it appears in the file (not a live DOM toast).

### Audio tap

Live graph today: voices → `masterGain` → limiter → `destination`. Public API exposes `getMasterGain()` but not a post-limiter node.

- Add `Player.getOutputNode(): AudioNode` (limiter if present, else master gain).
- Connect that node to a `MediaStreamDestination` **in addition to** speakers.
- Feed PCM into `AudioEncoder` (`mp4a.40.2` for MP4, Opus for WebM) with timestamps aligned to video.
- Mute/solo/master during the take are captured as played.

### Codec / format mapping

| Format | Video | Audio | Muxer |
|--------|-------|-------|-------|
| `mp4` | `avc1…` (H.264) | `mp4a.40.2` (AAC) | `mp4-muxer` |
| `webm` | `vp09…` (VP9) | Opus | `webm-muxer` |

Feature-detect at record start; on failure show a clear error and point the user at Settings → format.

### Code organization

| Piece | Location |
|--------|----------|
| Settings keys + atoms | `packages/app-core/src/utils/local-storage.ts`, `packages/app-core/src/stores/settings.store.ts` |
| Settings UI | `apps/desktop/src/renderer/src/components/settings/general.tsx` |
| Compositor + encode/mux | `apps/desktop/src/renderer/src/lib/performance-recorder/` |
| Toolbar wiring | `apps/desktop/src/renderer/src/components/panels/DesktopSongVisualizer.tsx` |
| Deps | `mp4-muxer`, `webm-muxer` on `apps/desktop/package.json` |
| Output node | `packages/engine/src/audio/playback.ts` (+ thin `PlaybackManager` helper if useful) |
| Save / folder pick | Desktop IPC / preload (`mp4`/`webm` filters, `openDirectory`) |

Keep WebCodecs/mux logic **desktop-only**. Settings atoms may live in app-core (unused on web).

### Robustness

- Skip frames when `VideoEncoder.encodeQueueSize` is high (backpressure).
- Keyframes about every 2 seconds.
- Dispose `VideoFrame` / `AudioData` promptly; tear down MediaStreamDestination on stop/dispose.
- Prefer hardware acceleration when available.

---

## Implementation Plan

### Engine

1. Expose post-limiter (or master) output node for recording taps without breaking the speaker path.
2. Ensure reconnect / dispose of the player does not leave dangling `MediaStreamDestination` connections.

### App-core

1. Add `StorageKey`s for all Performance recording settings (format, resolution, fps, qualities, title card, HUD, save mode, fixed folder, last folder, filename stem).
2. Add matching settings atoms (same pattern as `settingVizBgEffect`).

### Desktop

1. Add Performance recording section to General settings (gated on Song Visualizer feature).
2. Implement `performance-recorder/` module: compositor, title-card opacity timeline, WebCodecs session, mux finalize → `Uint8Array`.
3. Wire Record on the **normal** toolbar (kick-start → performance mode + record from start, loop off, play once, auto-stop on song end) and Record/Stop on the **performance** toolbar with the same one-shot rules; respect auto-hide chrome.
4. Extend save IPC for `.mp4` / `.webm` filters and directory picker for fixed-folder mode.
5. On exit performance while recording: finalize and run configured save path.

### Documentation

1. This feature doc (proposed → implemented when shipped).
2. Brief user-facing note in desktop help / release notes when complete.

### Out of scope for this implementation pass

Web clients, offline render pipeline, end cards, custom title text editor.

---

## Testing Strategy

### Manual

- Record MP4 and WebM; open in VLC / system player; check A/V sync and clean frames (no M/S / toolbar).
- Change resolution / fps / quality between takes and verify output.
- Title card on/off; channel HUD on/off.
- Save modes: `ask`, `last-folder`, `fixed-folder`.
- Mute mid-take affects recorded audio.
- Kick-start and in-PM Record both restart from the beginning with loop off; recording auto-stops at song end (one playthrough).
- Exit performance while recording respects save mode.
- Unsupported codec path shows a Settings-oriented error.

### Automated (light)

- Unit tests for even-dimension clamping, resolution mapping, filename `{name}` expansion, title-card opacity timeline helpers if extracted.
- Desktop typecheck after adding muxer packages.

---

## Migration Path

No migration. New settings default as in the table above. Existing songs need no AST changes; metadata already supports `name` / `artist`.

---

## Implementation Checklist

- [ ] `Player.getOutputNode()` (or equivalent) + safe record tap attach/detach
- [ ] StorageKeys + settings atoms for all recording options
- [ ] General Settings → Performance recording UI (desktop)
- [ ] `performance-recorder` compositor (bg + waves + optional HUD)
- [ ] Title card overlay in compositor
- [ ] WebCodecs MP4 path (`mp4-muxer`)
- [ ] WebCodecs WebM path (`webm-muxer`)
- [ ] Record button on normal visualizer toolbar (enter PM; restart from beginning; loop off; play once; auto-stop record on song end)
- [ ] Record/Stop + indicator in performance toolbar (same one-shot transport rules)
- [ ] Restore prior loop / transport preferences after the take ends (optional but preferred)
- [ ] Save: ask / last-folder / fixed-folder (+ directory IPC)
- [ ] Exit-while-recording finalize + save
- [ ] Manual verification matrix
- [ ] Mark this doc `status: implemented` when shipped

---

## Future Enhancements

- Web-ui recording (WASM ffmpeg or limited MediaRecorder fallbacks).
- Offline non-realtime render (deterministic frames + PCM → video).
- End card / scrolling credits from `description` / `tags`.
- Custom title-card duration, font, and position.
- Include/exclude background effect independently of live preview.
- 1440p / 4K presets if performance allows.
- Keyboard shortcut for Record/Stop in performance mode.

---

## Open Questions

1. Should a toolbar title-card toggle ship in v1, or Settings-only?
2. Exact bitrate tables for low/medium/high × 720p/1080p (tune after first encodes; **high @ 1080p30 should land near ~8 Mbps** for YouTube SDR).
3. Whether to add a `384` kbps AAC preset later to match YouTube’s stereo recommendation exactly.
4. Best `playback:ended` / length signal to auto-stop recording reliably across chips (confirm against `PlaybackManager` end events).

---

## References

- Song Visualizer / performance mode: `docs/features/complete/channel-visualizer.md`
- Desktop Song Visualizer: `apps/desktop/src/renderer/src/components/panels/DesktopSongVisualizer.tsx`
- Web visualizer (parity reference, no record UI): `apps/web-ui/src/panels/song-visualizer.ts`
- Live player: `packages/engine/src/audio/playback.ts`
- Existing audio export (WAV offline, not live video): `docs/features/complete/cli-audio-export.md`
- WebCodecs: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- `mp4-muxer` / `webm-muxer` (Vanilagy) for packaging encoded chunks

---

## Additional Notes

Performance-mode chrome already auto-hides on mouse idle (including mute/solo). That improves *live* presentation and future screen-capture workflows, but v1 recording must still use the **offscreen compositor** so chrome never leaks into the file and title cards are reproducible from metadata.

**YouTube-oriented defaults:** YouTube’s recommended upload encoding prefers progressive **H.264 in MP4** with **AAC** audio. **1080p at 30 fps** is the common upload sweet spot for music/visualizer content; YouTube’s SDR guidance is on the order of **~8 Mbps** for 1080p at 24–30 fps, which maps to our **high** video preset. Audio defaults to **256 kbps AAC** (best of the v1 presets). WebM remains available but is not the default because MP4 remains the path of least friction for YouTube Studio.
