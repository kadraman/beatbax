---
title: "CoPilot Test Scenarios"
status: proposed
authors: ["kadraman"]
created: 2026-06-21
updated: 2026-06-21
related:
  - docs/features/complete/ai-chatbot-assistant.md
  - docs/features/desktop-client-enhancements.md
---

## Summary

This document defines repeatable scenarios for refining BeatBax CoPilot in the desktop client. The goal is to improve correctness, reliability, and user trust by exercising common authoring workflows against known songs and checking both the AI output and the surrounding UI behavior.

CoPilot should be treated as a code-editing feature, not a generic chatbot. In edit mode, every accepted response must preserve valid BeatBax syntax, respect the current song structure, and avoid inventing language constructs.

---

## Test Goals

1. CoPilot produces valid BeatBax syntax for edits.
2. CoPilot preserves existing song structure unless explicitly asked to rewrite it.
3. CoPilot handles parse/diagnostic feedback and can repair its own mistakes.
4. CoPilot does not expose raw provider errors or confusing IPC/JSON messages.
5. Settings, API key validation, prompt history, and startup behavior remain predictable.
6. Automated tests capture the highest-risk regressions once a scenario is understood.

---

## Baseline Setup

Use `songs/sample.bax` as the primary baseline because it covers metadata, instruments, patterns, sequences, transforms, channels, and `play auto repeat`.

Before each scenario:

1. Open `songs/sample.bax`.
2. Verify the song parses with no diagnostics.
3. Enable AI Assistant.
4. Use a known provider configuration:
   - OpenAI with a valid key and quota.
   - OpenAI with a valid key but no quota.
   - Invalid key.
   - Local OpenAI-compatible endpoint if available.
5. Set CoPilot mode intentionally:
   - `Ask` for explanations.
   - `Edit` for code changes.

After each edit-mode response:

1. Use `Replace editor` only if the returned code is a full song.
2. Verify the editor diagnostics are clean.
3. Run playback or verification where applicable.
4. Compare whether unrelated sections changed.

---

## Syntax Correctness Scenarios

### 1. Melody Variation With Vibrato

Starting file: `songs/sample.bax`

Prompt:

```text
I would like it to be similar to melody_pat with different variations in notes and use some effects like vibrato.
```

Expected behavior:

- Uses valid pattern syntax such as `pat melody_var = ...`.
- Uses valid vibrato syntax such as `C5<vib:3,5>` or `effect leadVib = vib:3,5` plus `C5<leadVib>`.
- Updates `seq lead_seq = ...` to reference the new variation.
- Keeps `channel 1 => inst leadA seq ...` valid.
- Keeps `play auto repeat`.
- Does not introduce `seq ...` blocks with indented `note`, `length`, or `effect vibrato` lines.
- Does not emit comma-separated `play melody_pat, ...` directives.

Failure examples to catch:

```bax
seq melody_var
  note C4, E4, D4
  length 4
  effect vibrato
```

```bax
play melody_pat, melody_var, bass_pat
```

### 2. Bass Variation

Prompt:

```text
Make the bass more active while keeping the same chord movement and Game Boy style.
```

Expected behavior:

- Modifies or adds a `pat bass_* = ...` pattern.
- Keeps bass notes in a sensible low range.
- Preserves `channel 2` as `inst leadB` and any existing `:oct(-1)` transform unless explicitly changing the arrangement.
- Does not move bass material onto the melody channel.

### 3. Drum Fill

Prompt:

```text
Add a small drum fill at the end of the second phrase.
```

Expected behavior:

- Adds or modifies a drum pattern using existing noise instruments (`snare`, `hihat`, `perc`).
- Keeps channel 4 valid.
- Uses rests (`.`) and instrument names as tokens.
- Does not invent notes like `hi-hat` if the instrument is named `hihat`.

### 4. Wavetable Arpeggio Variation

Prompt:

```text
Make the wave arpeggio more interesting without changing the lead melody.
```

Expected behavior:

- Modifies or adds a wave/arp pattern.
- Updates `seq wave_seq` or channel 3 references.
- Does not alter `melody_pat` or `lead_seq` except when required.

### 5. Small Targeted Edit

Prompt:

```text
Only change the lead instrument to sound softer. Do not change any patterns.
```

Expected behavior:

- Only modifies the `inst leadA ...` line.
- Does not reorder sections or rewrite the full composition unnecessarily.
- Preserves metadata, patterns, sequences, channels, and play directive.

---

## Repair Scenarios

### 6. Repair Existing Parse Error

Setup: manually introduce a syntax error, for example:

```bax
pat bad = C5, D5, E5
```

Prompt:

```text
This song has errors. Please fix them without changing the composition.
```

Expected behavior:

- Uses diagnostics from the editor context.
- Removes invalid commas from pattern tokens.
- Does not add new musical material.
- Returns a valid full song in edit mode.

### 7. Repair CoPilot's Previous Bad Edit

Prompt:

```text
This change introduced errors. Fix only the syntax errors and keep the intended melody variation.
```

Expected behavior:

- Converts invented constructs into valid BeatBax equivalents.
- Keeps the user-requested intent when possible.
- Does not apologize instead of producing corrected code in edit mode.

---

## Ask Mode Scenarios

### 8. Explain Current Song

Prompt:

```text
Explain how this song is structured and what each channel does.
```

Expected behavior:

- Does not return a replacement song.
- Accurately identifies patterns, sequences, channels, and transforms.
- Mentions uncertainty rather than inventing features.

### 9. Explain Valid Syntax

Prompt:

```text
How do I add vibrato to a melody note in BeatBax?
```

Expected behavior:

- Shows valid syntax like `C5<vib:3,5>` or a top-level effect preset.
- Does not suggest `effect vibrato` inside a sequence block.

---

## Provider And Error Handling Scenarios

### 10. Valid Key, Successful Request

Expected behavior:

- Settings `Validate` reports `API key validated.`
- CoPilot request completes without browser CORS failures.
- No raw IPC wrapper is shown.

### 11. Invalid Key

Expected behavior:

- Settings validation reports that the provider rejected the key.
- CoPilot displays a readable error, not JSON or stack traces.

### 12. Valid Key, No Quota

Expected behavior:

- CoPilot shows a friendly message such as:

```text
OpenAI quota exceeded. Check your plan and billing details, or choose a different provider/key in AI Settings.
```

- It does not show raw JSON like `{"error": ...}`.
- It does not show Electron IPC wrapper text.

### 13. Network Timeout

Expected behavior:

- Settings validation reports that the provider did not respond.
- CoPilot reports a timeout in plain language.
- Loading state is cleared.

---

## Settings And State Scenarios

### 14. API Key Save And Clear

Expected behavior:

- API key input is wide enough to edit comfortably.
- `Validate` and `Clear key` are right-aligned on the row.
- Status/errors appear below the input row.
- `Clear key` empties the visible field and secure storage.
- CoPilot immediately reflects that no key is set.

### 15. Startup Restore

Expected behavior:

- If AI Assistant is enabled, CoPilot content is mounted on startup.
- The previously active right tab is restored:
  - Visualizer remains active if last active.
  - Help remains active if last active.
  - CoPilot is active only if last active.

### 16. Prompt Input History

Expected behavior:

- Submitted prompts are remembered across shutdown/startup.
- `Up` cycles through previous prompts.
- `Down` cycles forward and eventually restores the current draft.
- Multiline input still supports normal arrow navigation inside text.

---

## Output Quality Checks

For each edit-mode response, assess:

| Check | Pass Criteria |
|-------|---------------|
| Syntax | Editor diagnostics are clean after applying the code. |
| Scope | Only requested musical areas changed. |
| Structure | Metadata, instruments, patterns, sequences, channels, and play directive remain coherent. |
| Style | Formatting remains readable and close to the existing song. |
| Musical intent | The change plausibly satisfies the prompt. |
| Recovery | If a prior edit failed, CoPilot can repair the error without compounding it. |

---

## Suggested Automated Coverage

Add focused e2e or unit coverage as scenarios stabilize:

1. Settings validation success/failure with mocked IPC responses.
2. API key clear removes secure key and updates CoPilot status.
3. CoPilot prompt history Up/Down behavior.
4. Startup restore with AI enabled and active tab set to Help/Visualizer/CoPilot.
5. CoPilot error normalization for quota, invalid key, and timeout responses.
6. Prompt assembly snapshot or unit test that verifies the syntax reference includes invalid-syntax warnings.

For AI output itself, prefer deterministic tests around prompt/context construction and post-response validation rather than asserting a live model's exact text.

---

## Future Hardening Ideas

- Run returned edit-mode code through the BeatBax parser before enabling `Replace editor`.
- If parsing fails, show a warning and offer `Ask CoPilot to repair`.
- Prefer patch-style edits or structured edit plans over full-song rewrites for small changes.
- Add a "Validate response" step that displays syntax diagnostics before applying.
- Include a compact grammar reference from the parser/docs in CoPilot context instead of hand-maintained prompt text.
- Add provider-specific model presets and warnings for models that perform poorly at code editing.
