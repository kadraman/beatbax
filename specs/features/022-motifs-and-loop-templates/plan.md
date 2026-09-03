# Implementation Plan: Motifs and Loop Templates (Copy-in Library)

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

### AST Changes

None.

### Parser Changes

None. Optional later: a diagnostic helper “this fragment looks like a full song, save as loop template instead” — not required for v1.

### Engine / chip plugins

Add `NewSongWizardTemplateOption` entries to `templates.structure` (existing contract in [`packages/engine/src/chips/types.ts`](../../packages/engine/src/chips/types.ts)):

| Chip | File | Suggested ids |
|---|---|---|
| Game Boy | [`packages/engine/src/chips/gameboy/songWizard.ts`](../../packages/engine/src/chips/gameboy/songWizard.ts) | `gb-loop-8bar`, `gb-oneshot-sting` |
| NES | [`packages/engine/src/chips/nes/songWizard.ts`](../../packages/engine/src/chips/nes/songWizard.ts) | `nes-loop-8bar`, `nes-oneshot-sting` |
| SMS / GG | [`packages/plugins/chip-sms/src/songWizard.ts`](../../packages/plugins/chip-sms/src/songWizard.ts) | `sms-loop-8bar`, `sms-oneshot-sting` (and GG variants if templates are split) |
| Spectrum 128 | [`packages/plugins/chip-spectrum-128/src/songWizard.ts`](../../packages/plugins/chip-spectrum-128/src/songWizard.ts) | `spec-loop-8bar`, `spec-oneshot-sting` |

Game Boy first; other chips in the same milestone if cheap (copy the form, swap channel/inst names).

Keep `defaults.structure` on the existing sample id.

The wizard host already concatenates selected structure content in [`buildSongSource`](../../apps/web-ui/src/panels/new-song-wizard.ts) — no modal redesign for slice 1.

### App-core

New library module (suggested: `packages/app-core/src/library/`):

- In-memory catalog + platform storage adapter (desktop IPC vs `localStorage`).
- Built-in motif constants.
- Collision renaming for insert.
- Preview wrapper builder.

Wire commands in [`packages/app-core/src/editor/command-palette.ts`](../../packages/app-core/src/editor/command-palette.ts). Reuse [`insertHelpSnippetBlock`](../../packages/app-core/src/editor/help-snippet-insertion.ts).

### CLI Changes

None required. Authors can still copy `_loop_template.bax` on disk.

### Web UI / Desktop

- Help panel: Motifs section (web + desktop mirrors).
- Desktop File menu + `userData` persistence via existing IPC patterns.
- Web-lite: localStorage adapter; Insert from Help even when the command palette is gated.
- **Defer** a “My templates” pane in the duplicated New Song Wizard files unless slice 1+2 land cleanly.

### Export Changes

None. Copied text is a normal song.

### Documentation Updates

- This spec.
- Help panel copy (Motifs / loop vs one-shot).
- Cross-link from [song-composition-abstractions.md](song-composition-abstractions.md) Phase 3: copy-in library is **not** `include`.
- Optional: contributing note that chip plugins should offer a loop structure, not only a demo.

## Testing Strategy

### Unit Tests

- Wizard: GB (then other chips) structure options include loop + one-shot; loop content contains `play auto repeat`; one-shot contains `play auto` and not `repeat`; concatenated wizard output parses.
- Library: save / list / load round-trip; motif insert collision `name` → `name_2`; insert uses a standalone block (does not splice mid-line) — extend help-snippet tests if needed.
- Preview wrapper: fragment without `inst` still produces a playable snippet; fragment with `channel`/`play` is rejected as a motif (prompt to save as loop template).

### Integration Tests

- Desktop: Save as Loop Template → New from Template opens a new tab with cloned source and updated `song name`.
- Help Insert motif does not replace the current line when the cursor is collapsed.
- Web-lite localStorage cap: adding beyond the cap fails with a clear message (or evicts oldest — pick one and test it). Prefer **fail with a message** in v1.

## Migration Path

Fully additive. Existing `.bax` files, `.ins` imports, and wizard sample templates are unchanged. No song migration. Users who already keep `_loop_template.bax` on disk can Open + Save as Loop Template.
