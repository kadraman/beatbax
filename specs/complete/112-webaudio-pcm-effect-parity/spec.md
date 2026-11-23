---
title: "WebAudio ↔ PCM effect parity"
id: 112
slug: "webaudio-pcm-effect-parity"
status: "complete"
authors:
  - "kadraman"
created: "2026-11-21"
updated: "2026-11-23"
issue: "https://github.com/kadraman/beatbax/issues/276"
area: "engine"
related:
  - "specs/complete/033-effects-system/spec.md"
  - "specs/complete/110-gameboy-pulse-portamento/spec.md"
  - "specs/complete/025-arpeggio-effect/spec.md"
  - "specs/complete/031-cli-audio-export/spec.md"
  - "specs/complete/041-playback-via-cli/spec.md"
  - "specs/complete/077-web-audio-loudness-and-meter-display/spec.md"
  - "specs/complete/081-gameboy-noise-uge-playback-parity/spec.md"
  - "https://github.com/kadraman/beatbax/issues/42"
  - "https://github.com/kadraman/beatbax/issues/246"
  - "https://github.com/kadraman/beatbax/issues/271"
  - "https://github.com/kadraman/beatbax-fm1/issues/12"
---

# Feature Specification: WebAudio ↔ PCM effect parity

## Summary

CLI play and WAV export MUST sound like Desktop live playback for the same `.bax` song, after Desktop is corrected to the written contracts. Live Desktop uses the WebAudio graph and effect handlers; CLI play and all WAV exports use the offline PCM renderer. The written contracts in this spec and in [033](../../complete/033-effects-system/spec.md), [110](../../complete/110-gameboy-pulse-portamento/spec.md), and [025](../../complete/025-arpeggio-effect/spec.md) win where today's Desktop disagrees with them. Both paths then follow that contract, so distributed WAVs and hardware ports that clone PCM (e.g. beatbax-fm1) match what authors hear.

No new language syntax. This feature closes the dual-path gap that [110](../../complete/110-gameboy-pulse-portamento/spec.md) left explicit for PCM, and it amends the master limiter in [077](../../complete/077-web-audio-loudness-and-meter-display/spec.md) so live playback does not add level that WAV export does not have.

## Problem

1. Desktop live playback schedules voices with WebAudio nodes and applies effects via AudioParam automation. CLI `play` and Desktop/CLI WAV export call `renderSongToPCM`, which reimplements a subset of those effects with different math and omits others (`echo`, `retrig`).
2. Authors mix and hear songs correctly only in WebAudio. Exported WAVs and headless CLI play diverge — especially on `vib`, `arp`, and `port` (as in `songs/gameboy/tutorial_groove.bax`).
3. Spec 110 fixed continuous pulse `port` voices on WebAudio and explicitly left PCM unchanged, so portamento runs still click or glide differently on export.
4. Wave PCM lacks `arp`/`cut`, uses a different vibrato model than WebAudio, and does not share the engine’s 32-nibble wave tiling. Noise PCM ignores note effects. Plugin PCM drops remaining effects after inline macros.
5. Hardware (beatbax-fm1) baselines against CLI WAV and therefore ships the erroneous PCM sound.

## User scenarios

### User Story 1 — Tutorial groove export matches Desktop (Priority: P1)

An author opens `songs/gameboy/tutorial_groove.bax`, plays it in Desktop (hears wobble, spark arps, bass slides), then exports WAV or plays via CLI. The mix matches live preview for those effects within the parity gate.

**Why this priority**: This is the reported distribution blocker and the FM-1 clone reference song family.

**Independent test**: Export WAV (or render PCM) for the full song and for channels 1–4 at 44100 Hz stereo. Compare each note's level, pitch track, and envelope, plus band energy and full-mix level, against a WebAudio render of the same song. The feature gates in Success criteria pass. Whole-buffer correlation is not the test: oscillator phase is unspecified, and two WebAudio renders of this song fail a correlation gate while sounding the same.

**Acceptance scenarios**:

1. **Given** `tutorial_groove.bax` at 44100 Hz stereo, **When** PCM and corrected WebAudio are compared, **Then** the feature gates in SC-001 pass for the full mix and for channels 1–4.
2. **Given** channel 1 lead notes with `vib` (`wobble`), **When** rendered on Desktop and via PCM, **Then** both use Δf = depth × f² / 131072, where f is that note's frequency when the LFO starts, the LFO starts at phase 0, and depth, rate, and onset match.
3. **Given** channel 2 harmony notes with `arp` (`spark`), **When** rendered via PCM, **Then** the arpeggio cycle (root + offsets at chip frame rate) matches the written arp contract.
4. **Given** channel 3 bass notes with `port` (`slide`), **When** rendered on Desktop and via PCM, **Then** the glide starts from the previous note on that channel, stays continuous in pitch, and does not add a per-step fade or phase restart.

### User Story 2 — Shared effect semantics cannot drift (Priority: P1)

Pitch and amplitude modulation for registered note effects come from one sample-domain contract used by PCM and asserted against WebAudio schedules.

**Why this priority**: Without a single source of truth, the dual implementations will diverge again.

**Independent test**: Unit tests feed identical effect params into the shared modulation API and into WebAudio schedule expectations; values match within tolerance.

**Acceptance scenarios**:

1. **Given** effect types `vib`, `arp`, `port`, `trem`, `bend`, `sweep`, `volSlide`, and `cut`, **When** applied on Game Boy pulse, **Then** PCM applies the shared modulation contract and WebAudio automation matches that contract’s schedule.
2. **Given** the same effect types on Game Boy wave (where meaningful), **When** applied, **Then** PCM supports them (including `arp` and `cut`) with the same contract; wave vibrato uses the continuous LFO model WebAudio uses, not a divergent step-only path.
3. **Given** a note with no effects, **When** rendered on both paths, **Then** existing non-effect voice parity (envelopes, gains, instrument tick programs) is not regressively broken beyond the gate.

### User Story 3 — Echo and retrigger work in CLI and WAV (Priority: P2)

Songs that use `echo` / `retrig` no longer warn-and-drop those effects on PCM paths.

**Why this priority**: Tracked by [#42](https://github.com/kadraman/beatbax/issues/42); not used by `tutorial_groove` but required for full effect-system parity.

**Independent test**: Play and export `songs/gameboy/effects/gb_echo_demo.bax` and `songs/gameboy/effects/gb_retrigger_demo.bax` via CLI; effects are audible; no “unsupported in PCM” warning; Offline WebAudio vs PCM gates pass. There is no `songs/effects/` directory.

**Acceptance scenarios**:

1. **Given** a song with `echo`, **When** CLI play or WAV export runs, **Then** delay/feedback/mix are applied in PCM and Desktop export warnings no longer list `echo` as WebAudio-only.
2. **Given** a song with `retrig`, **When** CLI play or WAV export runs, **Then** retriggered attacks and volume deltas match WebAudio within the gate, and `retrig` is removed from WebAudio-only warnings.

### User Story 4 — Wave table and level path parity (Priority: P2)

PCM uses the same wave-table parsing and output level conventions as WebAudio/UGE so short tables and bass levels do not silently diverge.

**Why this priority**: Documented discrepancy; affects `tutorial_groove` bass (`wave=[…]` with 16 values).

**Independent test**: A 16-value wave instrument tiles to 32 on PCM the same way as WebAudio; level comparison within gate.

**Acceptance scenarios**:

1. **Given** a wave instrument with 16 values, **When** PCM renders, **Then** the table is tiled to 32 nibbles identically to the shared engine `parseWaveTable`.
2. **Given** the same wave note on WebAudio and PCM with no effects, **When** compared, **Then** RMS/peak stay within the gate (including any agreed output scale).

### Edge cases

- What happens when `port` appears on the first note of a channel (no prior pitch)? Both paths MUST hold the written pitch (no spurious glide).
- What happens when a `port` note follows a note that did not use `port`? Both paths MUST glide from that previous note's pitch. Gliding from an older `port` note and skipping the note in between is a defect.
- What happens when `vib` duration/delay rows are zero or omitted? Same defaults as the resolver `durationSec` / `delaySec`.
- What happens when multiple effects stack on one note? Modulation order matches the WebAudio application order for that voice.
- What happens for noise with note effects? Either apply the shared contract where meaningful or fail/warn consistently — MUST NOT silently ignore while WebAudio applies.
- What happens for non–Game Boy plugin chips? Remaining effects after inline macros MUST be applied when the backend can express them, or warned as unsupported — MUST NOT silent-drop without a warning.
- Oscillator start phase is unspecified. Gates compare level, pitch, envelope, and spectrum. They do not require matching samples or a correlation score.
- Energy above 16 kHz may differ between band-limited WebAudio and PCM. That band is outside SC-001.

## Requirements

### Functional requirements

- **FR-001**: System MUST use the written effect and voice contracts as the audible reference. Where Desktop WebAudio disagrees with those contracts, Desktop MUST be corrected. PCM MUST match the corrected behavior. Today's uncorrected Desktop output is not the reference for a behavior this spec marks as a defect.
- **FR-002**: System MUST provide a shared sample-domain modulation contract for `vib`, `arp`, `port`, `trem`, `bend`, `sweep`, `volSlide`, and `cut` consumed by PCM rendering.
- **FR-003**: PCM Game Boy pulse and wave rendering MUST apply that contract so CLI play and WAV export match corrected WebAudio within Success criteria.
- **FR-004**: PCM MUST implement continuous `port` voice behavior for Game Boy pulse and wave consistent with WebAudio (no per-step silence gap; phase continuous across contiguous `port` notes). This supersedes the “PCM stays as they are” clause of [110](../../complete/110-gameboy-pulse-portamento/spec.md) for PCM only.
- **FR-005**: PCM wave rendering MUST support `arp` and `cut` and MUST use continuous vibrato matching WebAudio.
- **FR-006**: PCM MUST implement `echo` and `retrig` per [#42](https://github.com/kadraman/beatbax/issues/42) and remove them from WebAudio-only export warnings when done.
- **FR-007**: PCM MUST use the shared 32-nibble wave-table parser (tile 16→32) used by WebAudio/UGE.
- **FR-008**: System MUST ship automated Offline WebAudio vs PCM parity tests for `tutorial_groove` (full + per-channel) and core effect fixtures.
- **FR-009**: Dual-rendering docs MUST describe PCM effect support accurately (not “None”).
- **FR-010**: CLI MUST NOT warn that echo/retrig are unsupported once FR-006 is met.
- **FR-011**: Game Boy pulse and noise MUST end a note with a 5 ms linear ramp to silence. Game Boy wave without a GB envelope MUST start a 20 ms exponential fade 20 ms before the nominal note end and MUST render that tail past the note end. PCM and WebAudio MUST use the same release. A hard cut at the nominal end is a defect.
- **FR-012**: A voice MUST be at its envelope's initial gain before it produces a sample. A sample at unity gain before the envelope is applied is a defect on every path.
- **FR-013**: The Desktop master limiter MUST be transparent at and below full scale, per the amendment to [077](../../complete/077-web-audio-loudness-and-meter-display/spec.md). On `tutorial_groove.bax` at master gain 1.0, post-limiter level stays within 0.2 dB of the pre-limiter signal in RMS and in active 50 ms windows. CLI play and WAV export MUST NOT run this limiter. When a mix's peak exceeds full scale, Desktop MAY reduce gain only while the signal is over full scale; PCM MAY scale the whole buffer down so the peak fits the playback ceiling. That whole-file scale is the specified difference for overs, and export MUST warn when it is applied.

### Non-goals

- New `.bax` effect syntax or new effect types.
- Changing UGE/MIDI export command mappings except where docs clarify PCM playback parity.
- Making Desktop live playback use PCM / ScriptProcessor as the primary path.
- OfflineAudioContext-only WAV export as the sole parity strategy (optional as a diagnostic capture tool only).
- beatbax-fm1 fixed-point phase work beyond re-baselining against post-fix BeatBax CLI WAV.
- Full Game Boy → chip-plugin-path migration ([#264](https://github.com/kadraman/beatbax/issues/264)) or AudioWorklet migration ([#161](https://github.com/kadraman/beatbax/issues/161)).
- Mastering / preview export ([#259](https://github.com/kadraman/beatbax/issues/259)).

## Success criteria

- **SC-001**: For `songs/gameboy/tutorial_groove.bax` at 44100 Hz stereo, corrected WebAudio vs PCM meets all of the following. The same gates pass for WebAudio real-time vs WebAudio offline (limiter bypassed), which shows the gates are reachable. Whole-buffer correlation is not a gate.
  - Each note's RMS level within 0.5 dB.
  - Plain-note pitch within 3 cents. A modulated pitch track (vib, arp, port) within 10 cents and 5 ms.
  - Envelope within 1 dB on 5 ms frames across the note and the 25 ms after the nominal end.
  - Band energy within 1 dB in each band from 20 Hz through 16 kHz, per channel and for the full mix.
  - Full-mix RMS within 0.3 dB, compared at master gain 1.0 against the pre-limiter WebAudio signal (post-limiter once FR-013 holds).
- **SC-002**: Effect fixture songs under `songs/gameboy/effects/` that use vib/arp/port/trem/cut/echo/retrig pass the same feature gates (or a documented per-fixture threshold no looser than these, with justification in `plan.md`).
- **SC-003**: `beatbax play` and `beatbax export wav` for `tutorial_groove.bax` produce audio authors accept as matching Desktop live (manual QA sign-off).
- **SC-004**: Export/CLI no longer list `echo`/`retrig` as WebAudio-only after those land.
- **SC-005**: Contributing dual-render docs and the instruments wave-table discrepancy note are updated.

## Assumptions

- Specs 033, 081, 110, and 271 stay authoritative except where this spec names a defect and corrects it. Spec 077's limiter threshold of −6 dB is amended here (FR-013).
- Vibrato depth uses the note's own frequency. Computing it from a fixed 440 Hz, and starting the LFO at an arbitrary phase, are defects.
- Sample rate for parity tests defaults to 44100 Hz stereo unless a fixture specifies otherwise.
- Author master-volume settings are outside the gate. Comparisons use master gain 1.0.

## Open questions

None blocking specification. A gate number may be tightened in `plan.md` after measurement. It may not be loosened without a justification recorded there.

## References

- Issue: https://github.com/kadraman/beatbax/issues/276
- Echo/retrig PCM: https://github.com/kadraman/beatbax/issues/42
- Spec 033 effects system; 110 pulse portamento; 025 arpeggio
- FM-1 CLI PCM oracle: https://github.com/kadraman/beatbax-fm1/issues/12
- Fixture: `songs/gameboy/tutorial_groove.bax`
