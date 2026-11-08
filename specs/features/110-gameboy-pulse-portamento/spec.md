---
title: "Game Boy pulse portamento continuity"
id: 110
slug: "gameboy-pulse-portamento"
status: "in-progress"
authors:
  - "kadraman"
created: "2026-11-08"
updated: "2026-11-08"
issue: "https://github.com/kadraman/beatbax/issues/246"
area: "engine"
related:
  - "specs/complete/033-effects-system/spec.md"
---

# Feature Specification: Game Boy pulse portamento continuity

## Summary

A contiguous run of Game Boy pulse notes linked by `port` is one sounding voice. The voice does not fade out or start a new oscillator at each step, and it does not restart the envelope on the joined notes. A note without `port` attacks as its own voice. This is the WebAudio playback of the legato already required by [spec 033](../../complete/033-effects-system/spec.md). `port` syntax, speed, UGE `3xx` export, and PCM rendering stay as they are.

## Problem

Fast `port` runs on a Game Boy pulse channel click and grit instead of gliding. The `rush` pattern in `songs/gameboy/digital_citadel.bax` (`C5<slide>:1` … with `effect slide = port:10` at 168 BPM) is the report in [#246](https://github.com/kadraman/beatbax/issues/246).

Spec 033 already says a `port` note continues the previous pitch without retriggering the envelope, and that later notes in the slide hold the level the opening note reached. The live pulse path still does three things that break that:

- Each note starts a new oscillator, so the waveform phase jumps at the step boundary.
- Every note, including one marked legato, ramps gain to silence over about 5 ms at its end. The next note opens again.
- The legato gain written for that hand-off is on a full-scale 0–1 range, while a normal pulse note is scaled by the pulse output gain. The boundary is both a gap and a level jump.

The pitch sequence is fine. The artefact is how the pulse voice is rendered.

## User scenarios

### User Story 1 — A portamento run is one voice (Priority: P1)

An author writes a chromatic or scalar run with `port` (or a named effect that expands to `port`) on each step that should glide, and hears one continuous pulse.

**Why this priority**: This is the audible bug. Short steps make the gap and the phase jump obvious.

**Independent test**: Schedule a plain pulse note, then two contiguous `port` notes. The plain note fades on its own. The two `port` notes share a second oscillator, and the second of those does not ramp gain to silence or start a new envelope.

**Acceptance scenarios**:

1. **Given** a Game Boy pulse instrument on the oscillator path (no baked duty or program-volume buffer), **When** a `port` note starts at the end of a note that has no `port`, **Then** the `port` note starts a new oscillator and runs the instrument envelope from the start. The earlier note fades as usual.
2. **Given** that `port` note is followed by another contiguous `port` note, **When** the later note starts, **Then** it reuses the same oscillator and does not restart the envelope. The earlier `port` note does not fade the voice to silence.
3. **Given** the first `port` note of a run that continues, **When** the instrument envelope would otherwise decay during that note, **Then** the whole run stays at the envelope's initial level. Later `port` notes do not drop to the decayed tail.

### User Story 2 — The note after the run attacks (Priority: P1)

The glide ends when the author writes a note without `port`. That note is a new attack, and the voice that was gliding releases.

**Why this priority**: Spec 033 retriggers on the first note that does not carry `port`. `rush` lands on `C6:1` without `slide`.

**Independent test**: After a two-note port chain, a contiguous note without `port` creates a second oscillator and schedules the usual short end ramp on the first voice.

**Acceptance scenarios**:

1. **Given** a contiguous port chain, **When** the next note has no `port`, **Then** that note starts a new oscillator and runs its envelope from the start.
2. **Given** the last `port` note of the chain, **When** its duration ends, **Then** the shared voice uses the existing short fade to silence.

### User Story 3 — A gap does not extend the voice (Priority: P2)

A rest, a sustain gap, or any note that is not a joinable pulse `port` note ends the shared voice. The next `port` note may still glide from the channel's remembered pitch, on a new oscillator.

**Why this priority**: Spec 033 already remembers pitch across rests. Continuity of the oscillator is only for notes that actually touch.

**Independent test**: A rest between two `port` notes yields two oscillators. The second still receives the previous pitch as the start of its glide.

**Acceptance scenarios**:

1. **Given** a pulse `port` note, a rest, and another pulse `port` note, **When** the second note plays, **Then** it starts a new oscillator.
2. **Given** the next event is a wave note, a noise note, a named hit, or a pulse note whose instrument bakes a buffer, **When** the chain is planned, **Then** the shared voice stops at the previous note.

### Edge cases

- The first note of a channel, or a `port` note that does not touch a held voice, starts a new oscillator. If it has `port`, its glide still starts from the channel's remembered pitch when one exists.
- A joined note may use a different static duty. The same oscillator changes waveform. It does not restart.
- Hardware sweep stays on the note that opened the voice. A joined note does not schedule another sweep.
- A port chain scheduled in a later playback pass (a loop restart) does not reuse an oscillator whose stop was already fixed in the previous pass.
- Stopping playback drops the held voice so the next play cannot join a dead oscillator.
- Opt-in buffered rendering is unchanged.

## Requirements

### Functional requirements

- **FR-001**: On the Game Boy pulse oscillator path, a `port` note MUST start a new oscillator and run the instrument envelope from the start, unless the previous note on that channel was itself a `port` note that held the voice through this start. Only then MUST it reuse that oscillator and MUST it not restart the envelope.
- **FR-002**: While a later contiguous `port` note will reuse the voice, the current `port` note MUST NOT ramp the voice to silence at its end. A note without `port` MUST fade even when the next note has `port`.
- **FR-003**: While a `port` run continues, the shared voice MUST hold the instrument envelope's initial level, including during the first `port` note. A fast downward envelope MUST NOT leave the later steps at the decayed tail. A preceding note that has no `port` MUST NOT supply this level. The held level MUST use the same pulse output scale as a normal attack.
- **FR-004**: The glide formula is unchanged. Speed is clamped to 1–255. Glide duration is `(256 - speed) / 256 * noteDuration * 0.6`, from the channel's previous frequency to this note's frequency.
- **FR-005**: A note without `port` MUST start a new oscillator and run its envelope from the start. The previous voice, if it was the end of a chain, MUST release with the existing short end ramp.
- **FR-006**: A `port` note that is not contiguous with a held voice MUST start a new oscillator. Pitch memory across rests is unchanged.
- **FR-007**: Contiguous means the next note's start equals this note's end on the channel grid (within 0.1 ms), including when sustains lengthen the earlier note. A rest, a different channel, a non-pulse event, or a pulse note that bakes a buffer ends the chain.
- **FR-008**: Instruments that bake a pulse buffer because duty or program volume moves, the wave channel, the noise channel, plugin chips, UGE `3xx` mapping, and the PCM renderer MUST keep their current behavior.
- **FR-009**: Stopping playback MUST clear the held voice and the portamento pitch and gain memory, as spec 033 already requires for effect state.

### Non-goals

- New `port` syntax, speeds, or curves.
- Continuing the hardware envelope clock through the joined notes. A continuing `port` run holds the initial level instead of decaying and then freezing the tail.
- Phase-continuous baked buffers, wave-channel portamento, or other chips.
- Changing UGE export or the PCM renderer's phase and legato envelope.
- Extending one oscillator across a loop boundary or through opt-in buffered rendering.

## Success criteria

- **SC-001**: A plain pulse note followed by two contiguous `port` notes creates two oscillators. The plain note fades. The `port` notes share the second oscillator and do not ramp gain to silence between them. The first `port` note attacks at the instrument envelope.
- **SC-002**: The next contiguous note without `port` creates a second oscillator and runs a new envelope. The shared voice fades at the end of the chain.
- **SC-003**: A rest, a non-pulse note, or a baked pulse program between `port` notes ends the shared voice.
- **SC-004**: Existing `port` frequency scheduling (previous pitch to target, same speed formula) still passes.

## Assumptions

- Desktop and web-lite play songs through `Player` without buffered rendering. That is the path this feature changes.
- Named effects such as `effect slide = port:10` are already expanded to a `port` effect on the note before scheduling.
- The note that opens a portamento voice is the first `port` note of the run. The note before that run is a separate attack.

## Open questions

None.

## References

- [Spec 033 — Portamento legato](../../complete/033-effects-system/spec.md)
- [#246](https://github.com/kadraman/beatbax/issues/246)
- `songs/gameboy/digital_citadel.bax` pattern `rush`
- `songs/gameboy/effects/gb_portamento_demo.bax`
