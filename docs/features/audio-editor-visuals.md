---
title: "Audio Editor Visuals — Making the UI Feel Like a Hardware Audio Tool"
status: proposed
authors: ["kadraman"]
created: 2026-04-03
issue: "https://github.com/kadraman/beatbax/issues/73"
---

## Summary

A collection of visual and UX enhancements to make the BeatBax web UI feel less like a generic code editor and more like a dedicated audio/music production tool. Items are grouped by implementation effort and visual impact.

---

## High Impact — Hardware Aesthetic

### 1. 7-Segment / LCD Font for Numeric Displays

Use the `DSEG7` font (free, available via CDN or self-hosted) for BPM values, the BAR:BT position counter, and any other numeric readouts in the transport bar and channel mixer.

**Why:** This single change transforms plain text inputs into hardware-style counters identical to Korg, Roland, and classic hardware sequencers.

**Implementation notes:**
- Load font via `@font-face` in `styles.css` or import from a CDN.
- Apply to `.bb-transport__bpm-value`, `.bb-transport__pos`, and note displays in the channel mixer.
- Provide a fallback monospace stack for environments where the font fails to load.

---

### 2. Animated Beat Indicator LED

A small circular "LED" element in the transport bar that pulses on each beat during playback. Uses a CSS keyframe flash triggered by a JS event.

**Why:** Provides immediate tactile feedback that the engine is running — essential for any hardware-style sequencer UI.

**Implementation notes:**
- Add a `<span class="bb-transport__beat-led">` to the transport bar HTML.
- Listen to `playback:position` (or a new `tick:beat` event) on the eventBus; add/remove a CSS class to trigger the flash animation.
- Two states: dim (idle) and bright green/amber (active flash).
- CSS `animation: bb-led-flash 80ms ease-out` — short and snappy, not a slow pulse.

---

### 3. VU-Meter Bars in the Channel Mixer

Replace static level indicators with animated vertical bar meters (8–16 segments, green → yellow → red) driven by real-time audio level data per channel.

**Why:** Every hardware and software mixer shows live level metering. Without it the mixer panel feels static.

**Implementation notes:**
- Requires an `AnalyserNode` per channel in the WebAudio graph (or read from the existing per-channel analyser if already present — see `per-channel-analyser.md`).
- Render segments as stacked `<div>` or a `<canvas>` column per channel.
- Segment colours: green (0–70%), yellow (70–90%), red (90–100%).
- Peak-hold line: a single segment that lingers at the highest recent level for ~1.5 s then falls.
- Update at ~30 fps via `requestAnimationFrame`.

---

### 4. Skeuomorphic Transport Controls

Style Play/Stop/Pause buttons with a 3D beveled appearance and give the BPM display area a dark inset LCD panel look with a subtle inner glow — similar to a Korg Electribe or Roland MC-505.

**Why:** Reinforces the hardware metaphor at the most-used part of the UI.

**Implementation notes:**
- Use `box-shadow: inset` for the LCD panel surround on `.bb-transport__bpm`.
- Buttons: `border-color` gradient to simulate bevel (lighter top-left, darker bottom-right).
- Add a faint green or amber `text-shadow` to BPM digits when using the LCD font.
- Keep all changes within `styles.css`; no layout restructuring required.

---

## Medium Impact — Visual Language

### 5. Warm Accent Colour Swap

Replace VS Code-derived blue highlights (`#094771`, `#0060c0`) with amber/gold (`#c8a227`, `#e8b84b`) or sequencer green (`#4a9945`) throughout the UI.

**Why:** Audio tools almost universally use warm neutral, amber, green, or red palettes. Cold blue reads as "developer tool."

**Implementation notes:**
- Define CSS custom properties (e.g. `--bb-accent`, `--bb-accent-hover`) and replace hard-coded colour values.
- Update both dark and light theme variants.
- Files to update: `styles.css`, Monaco theme in `beatbax-language.ts` or the theme JSON file.
- Also update the `bb-toolbar__btn--active` green to match the new accent.

---

### 6. Oscilloscope / Waveform Widget

A narrow `<canvas>` strip (e.g. 100 % wide × 48 px tall) below the toolbar or in a collapsible panel, showing the last few milliseconds of mixed audio output as a live waveform.

**Why:** Waveform visualisation is the universal signal of "audio application." Even a static placeholder during silence communicates the purpose of the tool.

**Implementation notes:**
- Use the master output `AnalyserNode` (or a gain-tap before the destination).
- Draw time-domain data (`getFloatTimeDomainData`) on a canvas at 30–60 fps.
- During silence: draw a flat centre line.
- Style: dark background, thin bright green or amber line, subtle grid lines (optional).
- Can be placed as a decorative strip inside the transport bar between the controls and the BPM display.

---

### 7. Pattern Grid Mini-View

A read-only row-of-blocks visualisation showing the active sequence order (each pattern as a coloured rectangle), similar to the arrangement/playlist view in Ableton Live or FL Studio.

**Why:** Gives the user an immediate spatial overview of the song structure without reading the text source.

**Implementation notes:**
- Source data from the last successful parse result (ISM or AST sequence definitions).
- Each block: width proportional to the number of steps in that pattern, colour from the channel colour map.
- Render as a single horizontal scrollable `<div>` with inline block children.
- Clicking a block could navigate the Monaco cursor to the corresponding `pat` definition.
- Live playback cursor: a vertical line that advances through the blocks as `playback:position` updates.

---

### 8. Rack-Panel Aesthetic for Toolbar / Transport

Add subtle horizontal ruled lines and a brushed-metal gradient to the transport bar background, giving it the appearance of a 1U rackmount panel.

**Why:** Low-effort CSS change with high visual payoff; immediately signals "hardware."

**Implementation notes:**
- Background: `linear-gradient` alternating very slight light/dark horizontal bands (1–2 px stripes) to simulate brushed metal.
- Panel borders: thin inset shadow top and bottom.
- Screw-hole decoration (optional): two small circular elements at the left and right edges of the transport bar.
- Contains entirely within `styles.css`.

---

## Rack Unit Styling

### 13. Transport Bar as a 1U Rack Panel

Style the transport bar to look like a physical 1U rackmount panel, complete with rack ears (flanged end tabs with countersunk screws) at each end and a brushed-aluminium face.

**Why:** The transport bar is the most hardware-like element in the UI — making it visually match real rack gear immediately sets the tone for the whole application.

**Implementation notes:**
- Pure CSS, no HTML changes required.
- Brushed-aluminium face: `background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 3px)` over a dark base.
- Machined edge: thick `border-top` and `border-bottom` using `inset` box-shadow to simulate a bevelled metal edge.
- Rack ears via `::before` / `::after` pseudo-elements on `.bb-transport`:
  - Fixed width (~20 px), full bar height.
  - Same brushed-metal gradient but slightly darker.
  - Countersunk screw: a small `border-radius: 50%` circle centred vertically, with `box-shadow: inset` to give a recessed look.
- Screw colour: dark gunmetal (`#2a2a2a`) with a subtle highlight on the top-left arc.
- Compatible with the existing transport bar layout — ears sit outside the button area.

---

### 14. Full App Frame as a Rack Cabinet

Add fixed-width left and right rack rail strips framing the entire application window, styled as dark steel rails with regularly-spaced rectangular slot holes.

**Why:** Frames the entire UI as a piece of rack-mounted equipment; subtle but gives every panel inside it a spatial context.

**Implementation notes:**
- Inject two thin `<div class="bb-rack-rail bb-rack-rail--left">` / `bb-rack-rail--right` elements into the root layout container in `buildAppLayout()`.
- Width: ~14 px each; full viewport height; `position: fixed`.
- Slot holes: `background: repeating-linear-gradient` or an inline SVG `<pattern>` — dark rectangular cutouts at regular intervals (~32 px pitch, as in real 19" racks).
- Optional: small `1U`, `2U`… unit number labels along the rail at 44 px intervals.
- A thin inner shadow on the edge facing the content area gives the rail a sense of depth.
- Rails must not overlap content; account for their width in the main layout `margin-left` / `margin-right`.

---

### 15. Panels as Rack Modules (Ambitious)

Give each panel (toolbar, transport bar, channel mixer) a panel height that is a multiple of 44 px (the standard 1U = 44.45 mm rack unit), and style each with its own brushed face, engraved label, and screw ear accents, making the full layout look like a populated rack.

**Why:** Takes the rack metaphor to its logical conclusion; each functional area reads as a discrete piece of gear.

**Implementation notes:**
- Introduce a CSS custom property `--bb-rack-unit: 44px` used as the base height unit.
- Transport bar → 1U (`44 px`).
- Toolbar → 1U (`44 px`).
- Channel Mixer → height is variable but snaps to the nearest whole `U` count.
- Each panel gets a `bb-rack-module` class with:
  - Brushed-metal face gradient.
  - Engraved-style label: small `text-transform: uppercase; letter-spacing: 0.15em; font-size: 9px; color: rgba(255,255,255,0.35)` placed at top-left of the panel.
  - Screw ears at both ends matching item 13.
- Panels could be made reorderable or resizable in a future drag-and-drop enhancement (out of scope here).
- Requires layout adjustments in `buildAppLayout()` and `styles.css`; no engine changes.

---

## Lower Effort / Polish

### 9. Rotary Knob for Volume

Replace the +/− volume stepper buttons with a rotary knob that rotates on mouse drag or scroll wheel, styled as a hardware potentiometer.

**Why:** Knobs are the quintessential hardware audio control. A +/− button pair reads as "software form field."

**Implementation notes:**
- Implement as a small `<canvas>` or pure CSS `transform: rotate()` on a knob SVG image.
- Input: `mousedown` + `mousemove` delta to derive rotation; clamp to [0°, 270°] range mapping to [0, 100]%.
- Also respond to `wheel` events for fine-tuning.
- Show current volume value as a tooltip or a small readout below the knob.
- Optionally use a knob library (e.g. `webaudio-controls`) or hand-roll a ~60-line canvas renderer.

---

### 10. Channel Colour Coding Across the UI

The four Game Boy channels already have defined colours in `CHANNEL_META` (pulse 1: `#569cd6`, pulse 2: `#9cdcfe`, wave: `#4ec9b0`, noise: `#ce9178`). Apply these consistently across every surface.

**Why:** Colour coding is a standard DAW convention (Ableton, FL Studio, Logic all do this). It allows users to recognise channels at a glance without reading labels.

**Surfaces to update:**
- Syntax highlighting: `channel 1` / `channel 2` / `channel 3` / `channel 4` keywords coloured per channel in Monaco theme.
- Channel Mixer: headers and VU meters use the channel colour.
- Transport position display: active channel highlight uses the channel colour.
- Pattern grid mini-view (feature 7): block colours derived from channel colour map.
- Any export status messages that reference a channel number.

---

### 11. "Power On" Boot Animation

A brief CRT-scanline fade-in overlay shown during the boot/loading phase, replacing the plain spinner.

**Why:** Sets the hardware tone from the very first frame; memorable and characterful.

**Implementation notes:**
- Add a full-screen overlay `<div class="bb-boot-overlay">` above the loading spinner.
- CSS: a `repeating-linear-gradient` of thin semi-transparent dark lines (scanlines), overlaid with a brightness ramp from dark to normal.
- Animation: `opacity: 1 → 0` over ~400 ms once the app is ready, with simultaneous `brightness(0) → brightness(1)`.
- Remove the element from DOM after the animation ends (`animationend` listener).
- Entirely confined to the startup path in `main.ts` and `styles.css`.

---

### 12. Monospace LCD Font for Note Names

Display note names (e.g. `C4`, `G#5`) in the Channel Mixer position readouts using the `DSEG7` or a narrow monospace LCD font.

**Why:** Makes numeric and note readouts look like hardware register displays; consistent with item 1 (LCD font for BPM).

**Implementation notes:**
- Reuse whatever font decision is made for item 1.
- Apply to `.bb-cp__note-name` or equivalent selectors in the channel mixer.
- Ensure the font is loaded only once (shared with transport bar usage).

---

## Implementation Checklist

- [x] 1. DSEG7 font loaded and applied to BPM / position displays
- [x] 2. Beat indicator LED with CSS flash animation
- [ ] 3. VU-meter segment bars in Channel Mixer (depends on per-channel analyser)
- [x] 4. Skeuomorphic transport button and LCD panel styles
- [x] 5. Warm accent colour CSS custom properties replacing hard-coded blues
- [x] 6. Oscilloscope canvas strip in/near transport bar
- [ ] 7. Pattern grid mini-view panel (requires ISM data from last parse)
- [x] 8. Rack-panel brushed-metal gradient on transport bar background
- [x] 9. Rotary knob component replacing volume +/− buttons
- [x] 10. Channel colour coding in Monaco theme, mixer, and pattern grid
- [x] 11. CRT scanline boot animation overlay
- [x] 12. LCD font applied to note name readouts in Channel Mixer
- [x] 13. Transport bar styled as a 1U rack panel with brushed-metal face and screw ears (CSS only)
- [~] 14. Full app frame rack cabinet rails — **WON'T IMPLEMENT**: any repeating pattern on a narrow fixed strip looks like visual noise at screen resolution; plain rails look like wasted whitespace. The rack metaphor is sufficiently conveyed by items 8 and 13.
- [ ] 15. All panels styled as rack modules snapping to 44 px multiples

---

## Open Questions

- Should items 1 and 12 use a self-hosted font (to avoid CDN dependency) or a CDN link?
- For item 5 (accent colour), should amber or green be the primary accent? Both have hardware precedent; amber leans retro/vintage, green leans Game Boy. **→ Amber chosen: `--bb-accent: #c8a227`. Green retained for LCD/LED elements.**
- Should the oscilloscope (item 6) be always visible or user-togglable (persisted via `localStorage`)?
- For item 9 (knob), should we use an existing library or hand-roll to avoid a new dependency?
- For item 13–15 (rack styling), should the rack rail width be visible at all viewport widths, or hidden below a minimum window width to avoid crowding on smaller screens?

---

## References

- DSEG7 font: https://github.com/keshikan/DSEG
- Heroicons v2 (existing icon library): https://heroicons.com/
- Web Audio `AnalyserNode`: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- `per-channel-analyser.md` — existing feature spec for per-channel audio analysis
