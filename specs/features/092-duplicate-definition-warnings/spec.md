---
title: "Duplicate definition warnings"
id: 92
slug: "duplicate-definition-warnings"
status: "specified"
authors:
  - "kadraman"
created: "2026-10-07"
updated: "2026-10-07"
issue: "https://github.com/kadraman/beatbax/issues/222"
area: "language"
related:
  - "specs/complete/045-instrument-imports/spec.md"
  - "specs/complete/017-copilot-local-ollama/spec.md"
  - "specs/complete/052-ai-chatbot-assistant/spec.md"
---

# Feature Specification: Duplicate definition warnings

## Summary

A song can define the same `pat`, `seq`, `inst` or `effect` name more than once in one file. The later definition silently replaces the earlier one, so the earlier line is dead code that still looks live. This spec keeps the last-wins meaning, adds a parser warning for each redefinition (the same treatment `subpat` already gets), stops Desktop Copilot from applying Edit replies that add new duplicates, and removes the existing duplicates from bundled songs.

## Problem

- **QA 2026-10-07.** On `songs/sample.bax`, which already had a `melody_vib` pattern from an earlier Edit, the model added a second `pat melody_vib` instead of editing the first. The parser accepted it with no diagnostic. The later (old) definition kept playing, so the model's change had no effect.
- **Copilot misreported it.** The change list indexes definitions by name, so the second `pat melody_vib` was hidden behind the first. The card summarised the edit as *Adjusted 4 lines (comments, metadata, or spacing)*, and the explanation-mismatch note (spec 017 § Edit apply behaviour, item 10) said `melody_vib` was not changed.
- **Bundled songs already have dead definitions.** `songs/sms/green_zone.bax` and `songs/sms/green_hill_remix.bax` each redefine `mel_a1`, `mel_b2` and `mel_b4` (three times) while correcting step counts. Only the last of each plays.
- [Compatibility](../../global/compatibility.md) requires failing loudly rather than silently dropping data or changing meaning. `subpat` redefinitions already warn ("subpat 'x' redefined; using the later definition."); the other definition kinds do not.

## User scenarios

### User Story 1 — See a warning when a name is defined twice (Priority: P1)

**Why this priority**: The parser is the single source of diagnostics for the editor, CLI and Copilot. A warning here makes the dead line visible everywhere at once.

**Independent test**: Parse a song with two `pat melody_vib` lines and confirm one warning on the later line, with playback unchanged.

**Acceptance scenarios**:

1. **Given** a file with two `pat melody_vib = …` lines, **When** it is parsed, **Then** the parser emits one warning on the later line: `pat 'melody_vib' redefined; using the later definition.` Playback, export and the AST use the later definition, exactly as today.
2. **Given** a file that redefines a `seq`, `inst` or `effect` name, **When** it is parsed, **Then** the same warning is emitted with that keyword (`seq 'lead_seq' redefined; …`, `inst 'lead' redefined; …`, `effect 'leadVib' redefined; …`).
3. **Given** three definitions of the same name, **When** parsed, **Then** two warnings are emitted, one on each later definition.
4. **Given** a song whose local `inst lead` overrides an `inst lead` from an imported `.ins` file, **When** parsed and resolved, **Then** no redefinition warning is added; the existing import-override behaviour from spec 045 is unchanged.
5. **Given** a `pat` and a `seq` with the same name, **When** parsed, **Then** no redefinition warning is emitted (different kinds are separate namespaces in this rule).
6. **Given** `beatbax verify` on a song with a redefinition, **When** run without `--strict`, **Then** it reports the warning and exits successfully; with `--strict` it fails, as for any warning today.

### User Story 2 — Copilot does not apply a reply that adds a duplicate (Priority: P1)

**Why this priority**: A reply that adds a second definition looks applied but changes nothing (or changes the wrong thing), and the card currently hides it.

**Independent test**: Replay the QA reply that adds a second `pat melody_vib` and confirm Copilot asks for a repair and, if the duplicate remains, shows **Not applied** naming the duplicate.

**Acceptance scenarios**:

1. **Given** a song that defines `melody_vib` once, **When** an Edit reply defines `pat melody_vib` twice, **Then** Copilot does not apply it and sends a repair request naming the duplicate and its line numbers, asking the model to keep one definition per name by editing the existing line. The thread shows *Duplicate definitions — asking Copilot to fix (1/2)…*.
2. **Given** the repair reply still defines `melody_vib` twice, **When** the repair attempts are used up, **Then** the card shows **⚠ Not applied — editor unchanged** with *Duplicate definition: `pat melody_vib` is defined more than once (lines 93 and 104).*
3. **Given** a song that already defines `mel_a1` twice, **When** an Edit reply keeps those two lines and changes something else, **Then** the reply is applied as today; only duplicates the reply adds count.
4. **Given** an Edit reply with both parse errors and a new duplicate, **When** validated, **Then** one repair request lists both, and the shared repair limit applies.
5. **Given** any applied Edit, **When** the card is shown, **Then** it never describes a new definition line as *comments, metadata, or spacing*.

### User Story 3 — The Edit model is told to edit, not redefine (Priority: P2)

**Why this priority**: Prevention is cheaper than repair, especially for small local models.

**Independent test**: Inspect the Edit system prompt.

**Acceptance scenarios**:

1. **Given** Edit mode, **When** the system prompt is built, **Then** it says to define each name once and to change an existing `pat`, `seq`, `inst` or `effect` by editing its line rather than adding another definition with the same name.

### Edge cases

- Redefinition inside an imported `.ins` file (two `inst lead` lines in the same `.ins`) warns, because both lines are in one file.
- Identical duplicate lines (same name and body) still warn; the earlier line is still dead.
- `channel N` duplicates remain errors (existing rule). `subpat` keeps its existing warning.
- Copilot counts duplicates per kind: a reply that adds `seq melody_vib` next to `pat melody_vib` is not a duplicate.
- A Copilot repair reply that removes a pre-existing duplicate is allowed; removing dead lines is not a new duplicate.

## Requirements

### Functional requirements

- **FR-001**: When a `pat`, `seq`, `inst` or `effect` name is defined again later in the same source file, the parser MUST emit a diagnostic with level `warning`, component `parser`, the location of the later definition, and the message `<keyword> '<name>' redefined; using the later definition.`
- **FR-002**: The last definition MUST continue to win. AST contents, ISM, scheduling and export output MUST be unchanged for every song; only diagnostics are added.
- **FR-003**: The rule applies within one source file. Overrides across files (a local definition replacing an imported one) keep the spec 045 behaviour and MUST NOT get an extra redefinition warning.
- **FR-004**: Existing `channel` duplicate errors and `subpat` redefinition warnings MUST be unchanged.
- **FR-005**: Desktop Copilot MUST treat an Edit reply as invalid when, for any `pat`, `seq`, `inst` or `effect` name, the reply defines it more times than the current editor song does and more than once.
- **FR-006**: An invalid-by-duplicate reply MUST go through the existing parse-repair loop (spec 052: up to 2 attempts, shared with parse errors). The repair request MUST list each new duplicate with its line numbers and ask for one definition per name, edited in place. The definition merge (spec 017 item 3) MUST NOT be used to resolve it.
- **FR-007**: If new duplicates remain after the repair attempts, Copilot MUST show **⚠ Not applied — editor unchanged** with one line per duplicate: *Duplicate definition: `<keyword> <name>` is defined more than once (lines A and B).*
- **FR-008**: The Edit system prompt MUST tell the model to define each name once and to change existing definitions in place.
- **FR-009**: Bundled songs MUST parse without redefinition warnings. The superseded lines in `songs/sms/green_zone.bax` and `songs/sms/green_hill_remix.bax` MUST be removed, keeping the last definition of each name so playback is unchanged.

### Non-goals

- Making redefinition an error, or changing last-wins.
- New strict-mode flags (existing `verify --strict` already fails on warnings).
- Copilot removing pre-existing duplicates on its own.
- Detecting near-duplicates (different names, same body).

## Success criteria

- **SC-001**: Parsing a file with two `pat melody_vib` lines yields exactly one warning, on the later line; the resolved song is identical to today's.
- **SC-002**: Every bundled song (`songs/**`) parses with zero redefinition warnings after cleanup, and the ISM of the two cleaned SMS songs is identical before and after.
- **SC-003**: For every song in `songs/**`, AST pattern, sequence, instrument and effect maps and exported output are byte-identical before and after the parser change.
- **SC-004**: Replaying the QA reply (second `pat melody_vib`) on `songs/sample.bax` never applies it silently: it is repaired or shown as **Not applied** with the duplicate named.
- **SC-005**: An Edit reply on a song with pre-existing duplicates, which adds none, applies as it does today.

## Assumptions

- Composers who redefine on purpose (for example while live-coding a variant) prefer a visible warning to silence; the warning does not block playback or export.
- The two SMS songs are drafts whose earlier lines were step-count corrections, not alternatives anyone relies on.

## Open questions

None. Decisions taken on 2026-10-07: warn rather than error; Copilot repairs first, then blocks.

## References

- [Spec 045 — Instrument imports](../../complete/045-instrument-imports/spec.md) (last-wins across files)
- [Spec 017 — Copilot with local Ollama](../../complete/017-copilot-local-ollama/spec.md) (Edit apply behaviour)
- [Spec 052 — AI chatbot assistant](../../complete/052-ai-chatbot-assistant/spec.md) (parse-repair loop, Edit instructions)
- [Global language contract](../../global/language.md), [compatibility](../../global/compatibility.md)
