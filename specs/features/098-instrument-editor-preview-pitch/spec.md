---
title: "Instrument editor preview pitch by type"
id: 98
slug: "instrument-editor-preview-pitch"
status: "in-progress"
authors:
  - "kadraman"
created: "2026-10-22"
updated: "2026-10-22"
issue: "https://github.com/kadraman/beatbax/issues/229"
area: "desktop"
related:
  - "specs/complete/021-instrument-editor-panel/spec.md"
  - "specs/complete/028-instrument-note-mapping-spec/spec.md"
  - "specs/complete/058-nes-apu-chip-plugin/spec.md"
  - "specs/complete/081-gameboy-noise-uge-playback-parity/spec.md"
---

# Feature Specification: Instrument editor preview pitch by type

## Summary

The Instrument Editor preview bar chooses starting octave and control layout from the chip plugin’s instrument-type schema: melodic types get a type-appropriate default octave (overridden by `note=` when set); noise and DMC use a Trigger (and Game Boy noise a tracker-note strip) instead of a chromatic piano that does not match hardware pitch. Bundled NES DMC samples may declare designed rate and base note for UI guidance only.

## Problem

- The preview keyboard always starts on octave 4 for every instrument ([021](../../complete/021-instrument-editor-panel/spec.md)). Bass-style voices (Game Boy wave, NES triangle, Spectrum tone3) are awkward to audition; SMS tone3 cannot preview distinctly below ~A2 (SN76489 10-bit period clamp).
- Game Boy noise pitch is `uge_note` → NR43 clock ([081](../../complete/081-gameboy-noise-uge-playback-parity/spec.md)), not melodic octave; the panel still shows a chromatic piano.
- NES noise (`noise_period`) and DMC (`dmc_rate` + sample) ignore note frequency; CodeLens already uses ▶ Sample for DMC while the panel does not.
- Spectrum 128 has no dedicated noise instrument type — percussion uses a tone channel with `tone_mix=true`, but the panel still shows a chromatic keyboard.
- Bundled samples such as `bass_c2` imply a design pitch/rate, but the UI has no metadata for that.

## User scenarios

### User Story 1 — Melodic default octave (Priority: P1)

**Why this priority**: Fixes the most common audition friction for leads vs bass.

**Independent test**: Select a wave (GB) or triangle (NES) instrument and confirm the piano opens on octave 2; select pulse and confirm octave 4; with `note=C3`, confirm octave 3.

**Acceptance scenarios**:

1. **Given** a melodic instrument with no `note=`, **When** it is selected, **Then** the preview octave is the type’s `previewOctave` (fallback 4).
2. **Given** a melodic instrument with `note=C3` (octave in 2–7), **When** it is selected, **Then** the preview octave is 3.
3. **Given** the user changed octave with Z/X or −/+, **When** they select another instrument of a different type, **Then** the octave re-resolves for that instrument (`note=` then type default).

### User Story 2 — Oneshot Trigger for noise and DMC (Priority: P1)

**Why this priority**: Melodic piano misrepresents hardware for these types.

**Independent test**: Select NES noise or DMC; confirm Trigger (not chromatic keys) and that audition uses instrument props.

**Acceptance scenarios**:

1. **Given** a type with `previewMode: oneshot`, **When** the Instruments tab shows it, **Then** the preview bar shows Trigger instead of the chromatic mini-keyboard.
2. **Given** Trigger, **When** pressed, **Then** preview plays a named instrument hit (not a dummy melodic note such as C4).
3. **Given** a DMC instrument with `@nes/<name>` that has bundled meta, **When** selected, **Then** the UI shows designed rate and/or base note as read-only guidance; changing `dmc_rate` remains the authoring control.

### User Story 3 — Game Boy noise uge_note audition (Priority: P1)

**Why this priority**: GB noise is the main percussion workflow and already uses `uge_note`.

**Independent test**: Select a GB noise inst; Trigger uses current `uge_note`; strip notes audition without writing Defaults unless the field is edited.

**Acceptance scenarios**:

1. **Given** `previewMode: uge_note`, **When** the panel shows the instrument, **Then** preview shows Trigger plus a tracker-note strip labelled as UGE / noise clock (not Octave).
2. **Given** Trigger, **When** pressed, **Then** named-hit preview uses the instrument’s current `uge_note` for NR43 clock.
3. **Given** a strip key (e.g. C-7), **When** pressed, **Then** audition temporarily overrides `uge_note` for that preview only and does not rewrite the `inst` line.

### User Story 4 — CodeLens alignment (Priority: P2)

**Why this priority**: Panel and CodeLens should not disagree about pitch semantics.

**Independent test**: CodeLens on noise/DMC shows ▶ Hit or ▶ Sample; melodic lenses centre on type octave when known.

**Acceptance scenarios**:

1. **Given** `previewMode` is not `melodic`, **When** CodeLens is shown on the `inst` line, **Then** a single ▶ Hit (or ▶ Sample for DMC) appears instead of C3…C7.
2. **Given** a melodic type with `previewOctave`, **When** CodeLens is shown, **Then** note lenses are centred on that octave (or the existing C3–C7 set updated equivalently).

### User Story 5 — Spectrum tone_mix percussion (Priority: P1)

**Why this priority**: AY noise is shared; drum kits are authored on tone1/2/3 with `tone_mix`, not a separate noise type.

**Independent test**: Select `inst snare type=tone3 … tone_mix=true …`; confirm Trigger (not chromatic keys) and named-hit audition using `note=`.

**Acceptance scenarios**:

1. **Given** a Spectrum (or AY) instrument with `tone_mix=true` on any tone type, **When** it is selected, **Then** the preview bar shows Trigger (oneshot) instead of the chromatic mini-keyboard.
2. **Given** such an instrument, **When** Trigger is pressed, **Then** named-hit preview uses the instrument’s props (including `note=` for the tone click layer).
3. **Given** `tone_mix` is cleared / set false, **When** the instrument is otherwise melodic, **Then** the chromatic keyboard returns.

### Edge cases

- Unknown / missing type in schema: treat as melodic octave 4.
- `note=` octave outside piano range 2–7: fall back to type `previewOctave`.
- Non-`@nes/` DMC sample refs: no bundled meta shown.
- Imported read-only instruments: same preview behaviour; Trigger still auditions.
- `tone_mix=true` overrides type `previewMode: melodic` (Spectrum percussion on tone channels).

## Requirements

### Functional requirements

- **FR-001**: `ChipInstrumentTypeDef` MUST allow optional `previewMode` (`melodic` | `oneshot` | `uge_note`, default `melodic`) and optional `previewOctave` (default 4 when melodic).
- **FR-002**: Chip instrument-editor schemas MUST set modes/octaves per the committed table (GB wave 2; NES triangle 2; Spectrum tone3 2; SMS tone3 3 — SN76489 period clamps below ~A2 so octave 2 keys are not distinct; GB noise `uge_note`; NES/SMS noise and NES DMC `oneshot`; other melodic types 4).
- **FR-003**: Selecting an instrument or changing its type MUST set preview octave from `note=` (if in 2–7), else type `previewOctave`, else 4, for melodic mode only.
- **FR-003a**: When `tone_mix` is true on the instrument draft (or `inst` line), preview mode MUST be `oneshot` regardless of the type’s schema `previewMode` (Spectrum/AY shared-noise percussion on tone channels).
- **FR-004**: Oneshot and uge_note modes MUST use named-hit (or equivalent instrument-prop) preview, not a dummy melodic pitch token as the sole pitch source.
- **FR-005**: uge_note mode MUST provide Trigger plus an audition-only tracker-note strip that does not write source unless the Defaults field is edited.
- **FR-006**: `ChipPlugin` MAY expose `bundledSampleMeta` parallel to `bundledSamples`; NES MUST publish designed rate 15 for kit samples and `baseNote: C2` for `bass_c2`.
- **FR-007**: CodeLens MUST follow `previewMode` (Hit/Sample vs melodic note list).
- **FR-008**: No change to song playback semantics for pattern notes on noise/DMC channels.

### Non-goals

- Hiding or gating `note=` / `pitch_env` fields by type.
- Inferring octave from instrument names.
- Language syntax changes.

## Success criteria

- **SC-001**: Selecting wave/triangle/tone3 vs pulse/lead shows different default preview octaves without manual Z/X.
- **SC-002**: Noise, DMC, and Spectrum `tone_mix=true` preview does not present a chromatic octave as the primary control.
- **SC-003**: GB noise Trigger / strip audition changes perceived brightness via `uge_note` clock mapping.
- **SC-004**: Unit tests cover octave resolution order, schema values, and named-hit / CodeLens behaviour.

## Assumptions

- Piano clamp remains 2–7 as in the current Desktop panel.
- Spec 021 host widget set is unchanged except preview-bar layout.

## Open questions

None.

## References

- [021 instrument-editor-panel](../../complete/021-instrument-editor-panel/spec.md)
- [028 instrument-note-mapping](../../complete/028-instrument-note-mapping-spec/spec.md)
- [081 GB noise UGE playback](../../complete/081-gameboy-noise-uge-playback-parity/spec.md)
- Issue: https://github.com/kadraman/beatbax/issues/229
