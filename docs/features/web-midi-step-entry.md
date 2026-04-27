---
title: "Web MIDI Step Entry in Monaco Editor"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-04-27
issue: "https://github.com/kadraman/beatbax/issues/100"
---

## Summary

Add browser-based MIDI **step entry** to the BeatBax web UI so users can enter notes into the Monaco editor from a connected MIDI keyboard.

The feature is explicitly scoped to **language-oriented note entry**, not DAW-style real-time recording. Users arm MIDI step entry, press notes on a MIDI keyboard, and BeatBax inserts or replaces note tokens in the editor according to the current cursor position, selection, and step-entry mode.

Initial scope:

- Web MIDI input for note-on/note-off capable devices
- Step entry only (no real-time timeline capture)
- Insert-at-cursor and replace-selection workflows
- Quantized note token generation for BeatBax patterns
- A compact MIDI subsection inside existing Editor settings

Out of scope for v1:

- Real-time MIDI recording
- Velocity-sensitive expression capture
- MIDI CC automation recording
- Chord-to-arp auto-conversion
- MIDI output / thru monitoring

---

## Problem Statement

BeatBax is a language-first composition environment, but note entry in the web UI currently depends entirely on typing in Monaco. This is precise, but it slows down melodic sketching for users who think in terms of piano keyboard layout rather than note names.

A browser-side MIDI step-entry workflow would improve composition speed without compromising BeatBax's language-centric model:

- Users can audition and enter pitches physically from a keyboard
- Patterns can be authored faster without memorizing note spellings during sketching
- Existing notes can be overwritten in place without leaving the text editor
- The resulting source remains plain BeatBax text, preserving determinism and portability

Real-time recording is a poor fit for BeatBax's current editing model because BeatBax is authored as text patterns and transforms, not as a piano-roll or clip timeline. Step entry fits the architecture and user workflow much better.

---

## Proposed Solution

### Summary

Create a web-ui MIDI input subsystem that uses the browser Web MIDI API to translate MIDI note input into BeatBax note tokens inserted directly into the Monaco editor.

The feature is activated from the editor UI via a **Record Step Input** toggle/button. While armed:

- MIDI note-on events are converted to BeatBax note names
- The editor inserts the note token at the current cursor/selection
- The cursor advances according to the configured step-entry mode
- If text is selected, the selected note token(s) are replaced rather than inserted before them

This is **step entry**, not performance capture. Note duration comes from the currently selected step length setting, not from note-on/note-off timing.

### Example Syntax

MIDI step entry does not add new BeatBax language syntax. It generates normal BeatBax pattern tokens.

Examples of generated output:

```bax
pat melody = C4 D4 E4 F4
```

With fixed duration insertion:

```bax
pat melody = C4:4 D4:4 E4:4 F4:4
```

With overwrite of an existing pattern span:

```bax
pat melody = C4 D4 E4 F4
```

Selecting `D4 E4` and pressing MIDI notes `G4 A4` results in:

```bax
pat melody = C4 G4 A4 F4
```

### Example Usage

#### Basic step entry

1. Open the web UI editor.
2. Place the cursor inside a `pat` definition.
3. Click `Record Step Input` in the toolbar.
4. Press notes on a connected MIDI keyboard.
5. BeatBax inserts note tokens at the cursor and advances after each inserted note.
6. Click `Stop Step Input` to exit the mode.

#### Replace selected notes

1. Select one or more existing note tokens inside a pattern.
2. Arm MIDI step entry.
3. Press one or more MIDI notes.
4. BeatBax replaces the selected token span with the newly entered notes.

#### Duration selection

If step length is set to `4`, each entered note becomes `C4:4`, `D4:4`, etc. If duration emission is disabled, the editor inserts bare note tokens and leaves surrounding pattern duration conventions unchanged.

#### Settings behavior

The settings UI includes a compact MIDI subsection inside the existing Editor settings panel where users can configure:

- MIDI input device
- Step length
- Insert vs overwrite preference
- Cursor auto-advance behavior
- Whether durations are emitted explicitly
- Whether note preview/audition is enabled during entry

---

## Implementation Plan

### AST Changes

No AST changes required.

This feature generates ordinary BeatBax source text and relies on the existing parser/AST pipeline unchanged.

### Parser Changes

No parser changes required for v1.

Generated output must always be valid existing BeatBax syntax. Any syntax-aware replacement logic happens in the web-ui editor layer, not in the parser.

### CLI Changes

No CLI changes required.

This is a browser-only authoring feature based on the Web MIDI API and does not affect CLI playback, export, or verification.

### Web UI Changes

Add a browser-side MIDI input subsystem to `apps/web-ui`.

#### 1. MIDI input service

Create a new module, for example:

```text
apps/web-ui/src/input/midi-step-entry.ts
```

Responsibilities:

- Request Web MIDI access from the browser
- Enumerate available MIDI input devices
- Subscribe to selected device messages
- Filter note-on / note-off messages
- Convert MIDI note numbers to BeatBax note names (`C4`, `F#5`, etc.)
- Expose step-entry lifecycle (`arm`, `disarm`, `setDevice`, `setMode`)

#### 2. Monaco editor integration

Extend the editor integration layer so MIDI input can perform syntax-aware note replacement.

Needed editor capabilities:

- Insert a note token at the current selection
- Replace selected note tokens with incoming MIDI-entered notes
- Advance cursor to the next insertion point after each successful step-entry event
- Optionally preserve surrounding spacing/alignment inside pattern lines

The existing Monaco wrapper already supports selection replacement; v1 should build on that abstraction rather than introducing editor-specific direct mutations throughout the codebase.

#### 3. Syntax-aware note range handling

Add a BeatBax-specific helper that understands pattern note tokens so replacement behavior is predictable.

Rules for v1:

- Step entry is only active inside `pat` bodies
- If the current selection is empty, insert at cursor
- If the selection covers one or more note/rest tokens, replace those tokens in order
- If the selection covers arbitrary non-pattern text, reject with a visible warning instead of guessing
- Do not mutate `seq`, `inst`, metadata, or non-pattern declarations

#### 4. Toolbar / command surface

Add a toolbar control for step entry:

- `Record Step Input` when idle
- `Stop Step Input` when armed

Optional command-palette commands:

- `BeatBax: Start MIDI Step Entry`
- `BeatBax: Stop MIDI Step Entry`
- `BeatBax: Toggle MIDI Step Entry`

#### 5. Settings UI

Add a compact MIDI subsection inside the existing Editor settings panel.

The feature should stay within the Editor panel as long as the number of controls remains small. A separate top-level MIDI tab is unnecessary for v1 and would overstate the scope of the feature.

Suggested fields:

| Setting | Type | Default | Description |
|--------|------|---------|-------------|
| MIDI Input Enabled | boolean | `false` | Master feature toggle |
| MIDI Input Device | string | `"system-default"` | Selected MIDI input device id/name |
| Step Length | enum | `"inherit"` | Inserted duration: `inherit`, `1`, `2`, `4`, `8`, `16` |
| Emit Explicit Durations | boolean | `false` | Whether inserted notes should include `:N` duration suffix |
| Entry Mode | enum | `"insert"` | `insert` or `overwrite-selection` |
| Auto Advance | boolean | `true` | Advance cursor after each step-entered note |
| Audition Input Notes | boolean | `true` | Preview entered notes locally in web playback engine when feasible |

Optional only if still needed after implementation review:

| Setting | Type | Default | Description |
|--------|------|---------|-------------|
| Channel Filter | enum | `"all"` | Accept MIDI from all channels or one selected channel |

If the settings surface starts expanding beyond these core controls, the project can promote MIDI into its own panel later. For v1, keeping it under Editor is the better fit.

#### 6. Diagnostics and user feedback

When MIDI step entry cannot proceed, the UI should show a clear warning in the output or status surface:

- Browser does not support Web MIDI
- User denied MIDI permission
- No MIDI device selected
- Current cursor is outside a pattern body
- Current selection does not align with replaceable note tokens

#### 7. Note spelling policy

BeatBax help text currently documents sharp notes, not flats. MIDI note naming in v1 must therefore emit **sharp spellings only**:

- `C#4`, not `Db4`
- `A#3`, not `Bb3`

This keeps generated source aligned with existing language guidance.

### Export Changes

No export changes required.

This feature only changes how source text is entered in the editor. Existing JSON, MIDI, UGE, WAV, and future exporter behavior remains unchanged because they consume normal BeatBax source.

### Documentation Updates

Add and maintain:

- This feature document
- Web UI help text / keyboard shortcut documentation for MIDI step entry
- Settings descriptions for the new MIDI section
- A short user-facing note explaining browser support limitations for Web MIDI

---

## Testing Strategy

### Unit Tests

- MIDI note number → BeatBax note name conversion (`60 -> C4`, `61 -> C#4`, etc.)
- Sharp-only note spelling policy
- Step-length formatting logic (`inherit`, explicit `:4`, etc.)
- Replace-selection tokenization logic for valid pattern selections
- Rejection of invalid selections outside pattern token spans
- Cursor auto-advance calculation after insert and overwrite
- Device selection / unsupported-browser state handling

### Integration Tests

- Monaco editor + MIDI step-entry controller inserts notes at cursor inside a `pat` definition
- Selection replacement replaces note tokens but not surrounding declarations
- Toolbar arm/disarm state stays in sync with MIDI input lifecycle
- Settings changes propagate live to the MIDI controller
- Unsupported browser / denied-permission states surface non-fatal warnings

### Regression Tests

- No changes to normal typing behavior in Monaco when MIDI step entry is disabled
- No changes to parsing, playback, or export behavior for source not produced by MIDI step entry
- No editor corruption when MIDI messages arrive while focus is outside a pattern body

---

## Migration Path

No migration required.

This is an additive web-ui authoring feature. Existing songs, editor workflows, and exported files remain valid unchanged.

---

## Implementation Checklist

- [ ] Create browser MIDI input service for Web MIDI device discovery and note event subscription
- [ ] Add MIDI step-entry state management (armed/disarmed, selected device, mode)
- [ ] Add Monaco integration for insert-at-cursor note entry
- [ ] Add syntax-aware replace-selection logic for pattern note tokens
- [ ] Reject MIDI insertion outside `pat` bodies with a clear warning
- [ ] Add toolbar button(s) for start/stop step entry
- [ ] Add command-palette actions for step entry lifecycle
- [ ] Add compact MIDI subsection to the Editor settings panel
- [ ] Persist MIDI device and behavior settings via local storage / settings store
- [ ] Add browser support / permission failure messaging
- [ ] Add unit tests for note conversion and selection replacement
- [ ] Add integration tests for Monaco + MIDI step entry workflow
- [ ] Update help text and documentation

---

## Future Enhancements

- MIDI chord entry that expands to sequential notes or configurable `arp` patterns
- MIDI velocity mapping to optional instrument/effect heuristics
- MIDI note input that respects currently selected chip/channel defaults
- Record-to-pattern-grid mode for structured multi-step entry workflows
- Optional real-time recording mode in a separate future feature, if the editor model evolves to support timeline-oriented capture
- Footswitch / sustain-pedal shortcuts for advancing steps or confirming entry

---

## Open Questions

1. Should `Step Length = inherit` reuse the nearest surrounding pattern duration convention, or simply emit bare note tokens with no explicit duration suffix?
2. Should overwrite mode consume one selected token per incoming MIDI note, or replace the whole selection immediately with the first note and then continue inserting?
3. Should note audition be mandatory when a note is entered, or optional because some users may want silent text-only entry?
4. Should MIDI step entry be limited to one note at a time in v1, or should simultaneous note-on events be accepted and serialized left-to-right by pitch?
5. Is the optional `Channel Filter` setting necessary for v1, or should MIDI input simply accept all channels to keep the Editor settings compact?

---

## References

- `apps/web-ui/src/editor/monaco-setup.ts`
- `apps/web-ui/src/editor/beatbax-language.ts`
- `apps/web-ui/src/editor/command-palette.ts`
- `apps/web-ui/src/main.ts`
- `apps/web-ui/src/stores/settings.store.ts`
- `apps/web-ui/src/utils/event-bus.ts`
- `docs/features/complete/web-ui-migration.md`
- Web MIDI API specification: https://webaudio.github.io/web-midi-api/

---

## Additional Notes

This feature must remain faithful to BeatBax's core product shape:

- The source of truth stays as plain text in Monaco
- MIDI is an **input convenience**, not a second composition model
- Step entry should never silently invent syntax or restructure patterns
- When ambiguity exists, the editor should refuse the operation and surface a clear diagnostic instead of guessing
