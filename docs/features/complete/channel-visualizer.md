---
title: "Channel Visualizer — Repurposed Legacy Channel Mixer"
status: implemented
authors: ["kadraman"]
created: 2026-04-15
issue: "https://github.com/kadraman/beatbax/issues/88"
---

## Summary

Repurpose the existing `ChannelMixer` (`channel-mixer.ts`) panel from a hybrid mixer/monitor into a dedicated **Channel Visualizer** — a per-channel oscilloscope / waveform display panel. Mixing controls (volume faders, mute/solo) now live exclusively in the `DawMixer`. The Visualizer focuses purely on real-time signal visualization and live performance display, including a **full-screen performance mode** with optional background graphics.

---

## Problem Statement

After introducing the `DawMixer` (bottom-docked horizontal channel strips), the legacy `ChannelMixer` has become redundant as a mixer. Its mute/solo buttons and volume slider duplicate controls already in the new mixer. However, the `ChannelMixer` has valuable visualization infrastructure — per-channel waveform canvases, real-time oscilloscope drawing via `AnalyserNode`, and synthetic waveform animation — that would be wasted if the panel were simply removed.

Additionally, the `DawMixer` is space-constrained and cannot show wide, readable waveforms alongside faders and VU meters. A separate full-height panel with dedicated canvas space per channel is the right home for waveform visualization.

Live coders performing on stage also need a clean, distraction-free full-screen mode that foregrounds the audio-reactive visuals.

---

## Proposed Solution

### Summary

1. **Rename** `ChannelMixer` → `SongVisualizer` (file: `song-visualizer.ts`, class: `SongVisualizer`).
2. **Remove** the volume fader, per-channel compact/full toggle, and the waveform-analyser toolbar button from the Visualizer. These live in the `DawMixer` now.
3. **Expand** each channel's oscilloscope canvas to use the freed vertical space — larger canvas height (e.g. 80px) for a more readable waveform.
4. **Migrate** the pattern / sequence / bar readouts from the `DawMixer` strips into the Visualizer cards (they were already in `ChannelMixer`; `DawMixer` strips now show only instrument name).
5. **Add full-screen performance mode**: a single button puts the Visualizer into an overlay covering the entire viewport. In full-screen mode, channel canvases are enlarged, the panel chrome collapses, and optional animated background graphics are displayed behind the waveforms.
6. **Background graphics** (optional, toggled per session): initial set is a simple animated starfield / scanlines effect rendered on a shared background canvas. More options TBD (see Future Enhancements).

### Panel Layout (normal mode)

Horizontal or vertical layout of channels:

```
┌──────────────────────────────────────────────────────────────────┐
│ [⬡ Waveforms] [⛶ Full screen]            SONG VISUALIZER     │  toolbar
├────────────────┬────────────────┬────────────────┬───────────────┤
│  CH 1 PULSE 1  │  CH 2 PULSE 2  │   CH 3 WAVE    │  CH 4 NOISE  │  channel label
│ ╭──────────╮  │ ╭──────────╮  │ ╭──────────╮  │ ╭──────────╮  │
│ │ ∿∿∿∿∿∿∿∿ │  │ │ ∿∿∿∿∿∿∿∿ │  │ │ ∿∿∿∿∿∿∿∿ │  │ │ ∿∿∿∿∿∿∿∿ │  │  oscilloscope
│ ╰──────────╯  │ ╰──────────╯  │ ╰──────────╯  │ ╰──────────╯  │
│  inst: lead    │  inst: bass    │  inst: wave1   │  inst: sn    │  instrument
│  seq: main     │  seq: main     │  seq: intro    │  seq: fill   │  sequence
│  pat: melody   │  pat: bass_pat │  pat: melody   │  pat: FILL   │  pattern
│  Bar 3 / 8     │  Bar 3 / 8     │  Bar 2 / 8     │  Bar 3 / 8   │  progress
└────────────────┴────────────────┴────────────────┴──────────────┘
```

### Full-Screen Performance Mode Layout

Horizontal or Vertical layout of waveforms, with or without text, e.g. in horizontial mode waveform encompass whole width of screen.
```
┌──────────────────────────────────────────────────────────────────┐
│                  ░░░░░░ background graphics ░░░░░░               │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ PULSE 1    │  │ PULSE 2    │  │ WAVE       │  │ NOISE     │  │
│  │            │  │            │  │            │  │           │  │
│  │ ∿∿∿∿∿∿∿∿∿∿ │  │ ∿∿∿∿∿∿∿∿∿∿ │  │ ∿∿∿∿∿∿∿∿∿∿ │  │ ∿∿∿∿∿∿∿∿∿ │  │
│  │            │  │            │  │            │  │           │  │
│  │ lead       │  │ bass       │  │ wave1      │  │ sn        │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │
│                                                          [✕ Exit] │
└──────────────────────────────────────────────────────────────────┘
```

---

## Scope

### In scope

- Rename `ChannelMixer` → `SongVisualizer` (`song-visualizer.ts`, class `SongVisualizer`).
- Remove from Visualizer (now in DawMixer):
  - Volume fader / slider
  - Compact/full layout toggle
  - Per-channel analyser toggle button (keep the subscription; feature flag still controls whether waveforms are drawn)
- Retain and enhance in Visualizer:
  - Per-channel oscilloscope canvas (increase default height from 24px → 80px).
  - Synthetic waveform animation when analyser is off (duty-cycle square for pulse, sine for wave, random for noise).
  - Real `AnalyserNode` waveform drawing when `settingFeaturePerChannelAnalyser` is on.
  - Channel colour accent, label, instrument / sequence / pattern / progress readouts.
  - Mute / Solo buttons (kept here as secondary controls; DawMixer is the primary).
- **Full-screen performance mode**:
  - A toolbar button (icon: `arrows-pointing-out`) triggers `document.documentElement.requestFullscreen()` (with Fullscreen API fallback). Falls back to a fixed-position CSS overlay if the Fullscreen API is unavailable (e.g. cross-origin iframe).
  - In full-screen: channel canvases expand to fill available height, panel chrome (toolbar, progress, event counter) collapses to just labels + waveforms + instrument names.
  - Exit via Escape key (standard browser Fullscreen behaviour), or an explicit `[✕]` button overlaid bottom-right.
  - A `fullscreenchange` event listener re-renders the panel on enter/exit to switch between normal and large canvas sizes.
- **Background graphics** (full-screen only, off by default):
  - A shared `<canvas id="bb-viz-bg">` is rendered behind all channel canvases when full-screen is active.
  - Initial built-in effect: **Starfield** — randomly positioned stars that drift slowly, audio-reactive brightness scaled by per-channel RMS.
  - Initial built-in effect: **CRT Scanlines** — horizontal semi-transparent lines overlaid at a fixed interval, giving a retro monitor look.
  - Effect selection persisted to `localStorage` (`StorageKey.VIZ_BG_EFFECT`).
  - When no effect is selected (`'none'`), the background canvas is hidden (pure black).
  - Optional scrolling text with song metadata, e.g. name, description.
- `StorageKey` additions:
  - `PANEL_VIS_SONG_VISUALIZER` — panel show/hide
  - `VIZ_BG_EFFECT` — active background effect id (`'none'` | `'starfield'` | `'scanlines'`)
- View menu: rename "Channel Mixer" → "Song Visualizer"; keep the same keyboard shortcut or assign a new one (open question — see below).
- Update `main.ts`: replace `ChannelMixer` instantiation with `SongVisualizer`.
- Update `docs/features/daw-channel-mixer.md` acceptance criteria to reflect that pattern/sequence readouts have moved to the Visualizer.

### Out of scope (future enhancements — see below)

- Audio-reactive shader / WebGL backgrounds.
- Custom user-supplied background images or videos.
- Spectrogram / FFT frequency display mode.
- Lissajous / XY scope mode.
- MIDI-sync'd beat-flash effects.
- Chroma / pitch waterfall view.

---

## Implementation Plan

### File changes

| Action | File |
|---|---|
| Rename + refactor | `apps/web-ui/src/panels/channel-mixer.ts` → `song-visualizer.ts` |
| Update | `apps/web-ui/src/main.ts` |
| Update | `apps/web-ui/src/utils/local-storage.ts` (new `StorageKey` values) |
| Update | `apps/web-ui/src/styles.css` (canvas sizing, full-screen overrides, bg canvas) |
| Update | `apps/web-ui/tests/channel-mixer.test.ts` → `song-visualizer.test.ts` |
| Update | `docs/features/daw-channel-mixer.md` |
| New | `docs/features/channel-visualizer.md` (this document) |

### CSS additions

```css
/* Visualizer panel — normal mode */
.bb-viz__wave-canvas { width: 100%; height: 80px; }

/* Full-screen overlay */
.bb-viz--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
  display: flex;
  flex-direction: column;
}
.bb-viz--fullscreen .bb-viz__wave-canvas { flex: 1; height: auto; }

/* Background canvas (behind channel canvases) */
#bb-viz-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.bb-viz__channels { position: relative; z-index: 1; }
```

### Background effects API (internal)

```typescript
interface BgEffect {
  id: string;
  label: string;
  /** Called once when full-screen is entered. */
  init(canvas: HTMLCanvasElement): void;
  /** Called every RAF frame. rmsValues: channelId → 0-1 RMS. */
  draw(canvas: HTMLCanvasElement, rmsValues: Map<number, number>): void;
  /** Called when full-screen exits or effect is changed. */
  dispose(): void;
}
```

Built-in effects are registered in an internal `BG_EFFECTS: BgEffect[]` array. Future effects can be added without changing the public API.

---

## Testing Strategy

### Unit Tests

- `SongVisualizer` renders one card per channel (same structure as current `ChannelMixer` tests).
- Waveform canvas exists per channel and has correct dimensions.
- Full-screen mode: toggling `isFullscreen()` attaches / removes the `bb-viz--fullscreen` class and the background canvas.
- `playback:position-changed` updates instrument, sequence, pattern, and progress elements.
- `playback:stopped` resets all readouts and clears canvases.
- Background effect `'none'` hides bg canvas; `'starfield'` shows it.

### Integration Tests

- `DawMixer` strips no longer contain `bb-hmix__pat` or `bb-hmix__seq` elements after this change.
- `SongVisualizer` and `DawMixer` can coexist without duplicate element IDs (all IDs use distinct prefixes: `bb-hmix-*` vs `bb-viz-*`).

---

## Migration Path

1. The existing `channel-mixer.ts` is refactored in-place (renamed, volume fader removed, canvas enlarged, full-screen added).
2. `main.ts` import and instantiation updated from `ChannelMixer` to `SongVisualizer`.
3. `StorageKey.CHANNEL_COMPACT` becomes unused and can be deprecated (no compact mode in Visualizer).
4. Any code referencing `bb-cp-*` element IDs is updated to `bb-viz-*`.

---

## Implementation Checklist

- [ ] `song-visualizer.ts` created from `channel-mixer.ts`; class renamed, volume fader removed, canvas height increased to 80px
- [ ] `DawMixer` strips: `bb-hmix__pat` and `bb-hmix__seq` elements removed; `updatePosition` writes removed
- [ ] Full-screen mode: toolbar button, Fullscreen API call, CSS overlay class, exit button and Escape handling
- [ ] Background canvas element added to full-screen DOM; `BgEffect` interface implemented
- [ ] Built-in `starfield` effect implemented (stars + RMS brightness)
- [ ] Built-in `scanlines` effect implemented (static CRT overlay)
- [ ] `StorageKey.VIZ_BG_EFFECT` and `StorageKey.PANEL_VIS_SONG_VISUALIZER` added
- [ ] View menu item updated: "Channel Mixer" → "Song Visualizer"
- [ ] `main.ts` updated to instantiate SongVisualizer`
- [ ] `song-visualizer.test.ts` passes (adapted from `channel-mixer.test.ts`)
- [ ] No TypeScript errors; all existing tests pass

---

## Future Enhancements

- **More background effects**: audio-reactive particle system, spectrum waterfall, Lissajous XY scope, beat-sync strobe.
- **WebGL / shader backgrounds**: high-performance GPU-accelerated visuals via a `<canvas>` with WebGL context.
- **User-supplied media**: drag-and-drop custom background image or video, displayed behind waveforms in full-screen.
- **Configurable waveform style**: line, filled, mirror (symmetric top/bottom), spectrogram.
- **MIDI-sync beat flash**: full-screen background flashes on beat boundaries.
- **Chroma / pitch waterfall**: scrolling spectrogram showing note frequencies over time.
- **Separate window**: `window.open()` the visualizer into a second monitor for live performance setups.

---

## Open Questions

1. **Keyboard shortcut** — should "Song Visualizer" reuse `Ctrl+Shift+M` (currently "Channel Mixer") or get a new shortcut (e.g. `Ctrl+Shift+V`)? Repurposing is less disruptive but changes the meaning. Lets use Ctrl+Shift+V if not already taken.
2. **Mute/Solo in Visualizer** — keep them as secondary controls (useful when the DawMixer is collapsed), or remove to keep the Visualizer read-only? Leaning towards keeping them.
3. **Background effect in windowed mode** — should the starfield/scanlines be available in normal (non-full-screen) mode too, or only in full-screen? Starting with full-screen only keeps the normal panel clean.
4. **Effect selector UI** — a dropdown in the toolbar, or a small settings panel that slides in? Toolbar dropdown is simpler for the initial implementation.

---

## References

- `apps/web-ui/src/panels/channel-mixer.ts` — current implementation being repurposed
- `apps/web-ui/src/panels/daw-mixer.ts` — DAW mixer (mixing controls)
- `apps/web-ui/src/stores/channel.store.ts` — mute/solo/volume state
- `docs/features/daw-channel-mixer.md` — DAW mixer spec (co-delivered changes)
- MDN Fullscreen API: https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
- MDN Web Audio `AnalyserNode`: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- MDN Canvas 2D: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
