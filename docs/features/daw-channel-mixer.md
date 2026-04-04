---
title: "DAW-Style Horizontal Channel Mixer with VU Meters"
status: proposed
authors: ["kadraman"]
created: 2026-04-04
issue: "https://github.com/kadraman/beatbax/issues/75"
---

## Summary

Replace the current vertical side-panel Channel Mixer with a traditional DAW-style horizontal strip docked at the bottom of the screen. Each Game Boy channel (Pulse 1, Pulse 2, Wave, Noise) is presented as a vertical channel strip arranged side by side — matching the layout of mixers in Ableton Live, FL Studio, Logic Pro X, and hardware consoles such as the Neve 8078 and SSL 4000.

The redesign also introduces animated **VU-meter segment bars** driven by real-time `AnalyserNode` data per channel.

---

## Motivation

The current mixer is a compact card list in the right pane. This works for quick status checks but has several limitations:

- It competes for space with the output/problems panel in the same right pane.
- Vertical card layout does not map naturally to the horizontal "channel strip" mental model every DAW user has.
- There is no live audio level metering; the static level bar is purely a position indicator, not a signal meter.
- Mute/Solo buttons are contextual to the card rather than immediately scannable across all channels at once.

A bottom-docked horizontal mixer strip fixes all of these: channels are always side-by-side, metering is physically located where the audio metaphor lives (below the arrangement), and it frees the right pane entirely for output/chat/problems panels.

---

## Proposed Layout

```
┌──────────────────────────────────────────────────────────┐
│  TRANSPORT BAR                                           │
├──────────────────────────────────────────────────────────┤
│  PATTERN GRID (optional, toggleable)                     │
├───────────────────────────────────────────────────────────┤
│  EDITOR pane          │  RIGHT pane (output/chat/…)      │
│                       │                                  │
│                       │                                  │
├──────────────────────────────────────────────────────────┤
│  MIXER STRIP  [Ch1]  [Ch2]  [Ch3]  [Ch4]  (new)         │
└──────────────────────────────────────────────────────────┘
```

Each channel strip from left to right:

```
┌──────────┐
│ Ch label │  e.g. "PULSE 1"
│  colour  │  channel-colour accent bar at top
├──────────┤
│          │  VU meter — 12 segments, green→yellow→red
│  ██████  │  peak-hold line
│  ██████  │
│  ██████  │
│  ▒▒▒▒▒▒  │  (dim above peak)
│          │
├──────────┤
│ inst name│  current instrument
│ pat name │  current pattern
├──────────┤
│  fader   │  vertical volume fader (chip-dependent; greyed-out for GB)
├──────────┤
│  [M] [S] │  Mute / Solo
└──────────┘
```

---

## Scope

### In scope

- New `HorizontalMixer` component (`apps/web-ui/src/panels/horizontal-mixer.ts`) replacing the current `ChannelMixer` class in `channel-mixer.ts` for the bottom-docked position.
- Per-channel **VU-meter** bars: 12 vertical segments per channel, animated at ~30 fps via `requestAnimationFrame`.
  - Segment colours: green (segs 1–8), yellow (segs 9–10), red (segs 11–12).
  - Peak-hold: highest segment lit for ~1.5 s then decays.
- Live **instrument and pattern name** readouts per channel (from `playback:position-changed` events).
- **Volume fader** per channel (vertical slider): enabled for chips in `VOLUME_SUPPORTED_CHIPS`; visually locked (greyed-out, `pointer-events: none`) for Game Boy until a volume register is available.
- **Mute / Solo** buttons per strip, visually consistent with the existing `bb-cp__btn--mute` / `bb-cp__btn--solo` styles and the Pattern Grid M/S buttons.
- **Resize handle** at the top edge of the mixer strip so users can drag to adjust height.
- Persistent collapse/expand toggle (stored in `localStorage`): collapsed shows only a thin strip with VU meters; expanded shows full strips.
- View menu toggle: `Ctrl+Shift+M` to show/hide mixer (replacing the current Channel Mixer toggle).
- Light-mode variant for all new elements.

### Out of scope (future)

- EQ / send / aux routing per channel.
- More than 4 channels (multi-chip expansion handled by the plugin system).
- Drag-to-reorder channel strips.
- Automation lane overlays.

---

## Per-Channel AnalyserNode Requirement

Each channel needs its own `AnalyserNode` tapped from the audio graph, consistent with the existing `per-channel-analyser.md` spec. Specifically:

1. In `GameBoyAPU` (or whichever chip backend), a `GainNode → AnalyserNode` tap is inserted before each channel feeds the master output.
2. The analyser nodes are exposed via the playback engine API (e.g. `playbackEngine.getChannelAnalyser(channelId): AnalyserNode | null`).
3. The `HorizontalMixer` calls `getFloatFrequencyData` / `getByteTimeDomainData` on each analyser inside its RAF loop.

If `getChannelAnalyser` returns `null` (engine not running, OfflineAudioContext render, or no audio context), the VU meters show zero / idle state with no error.

---

## Migration Plan

1. The existing `ChannelMixer` (`channel-mixer.ts`) is **kept as-is** during development and removed once `HorizontalMixer` reaches feature parity.
2. The bottom-docked host `div` (`#bb-mixer-host`) is added to `buildAppLayout()` below the three-pane layout.
3. `main.ts` instantiates `HorizontalMixer` and wires the same events (`parse:success`, `playback:position-changed`, `playback:stopped`, `playback:paused`, `playback:resumed`).
4. The old right-pane channel mixer is hidden by default; a flag in `localStorage` (`panel.channel-mixer-legacy`) can re-enable it during transition.

---

## Acceptance Criteria

- [ ] Four horizontal channel strips rendered at the bottom of the app, one per Game Boy channel.
- [ ] Each strip shows channel name, colour accent, mute/solo buttons, instrument name, pattern name.
- [ ] VU meter animates in real time during playback; shows idle (all bars unlit) when stopped.
- [ ] Peak-hold segment lingers for ~1.5 s then falls.
- [ ] Volume fader present but locked (greyed-out) for Game Boy chip; active for future chips.
- [ ] Mixer strip height is user-adjustable via drag; state persists in `localStorage`.
- [ ] Collapse/expand toggle: collapsed mode shows only channel label + VU meter.
- [ ] View menu item `Ctrl+Shift+M` toggles mixer visibility; state persists.
- [ ] All existing mute/solo behaviour (channel store, pattern grid, glyph margin) continues to work via `channelStates` store — no behaviour regression.
- [ ] Light-mode styles applied.
- [ ] No TypeScript errors; existing tests continue to pass.

---

## References

- `docs/features/per-channel-analyser.md` — analyser node tap spec
- `apps/web-ui/src/panels/channel-mixer.ts` — current implementation
- `apps/web-ui/src/stores/channel.store.ts` — mute/solo/volume state
- `docs/features/audio-editor-visuals.md` — parent visual enhancements spec (items 3 and 15)
- Web Audio `AnalyserNode`: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
