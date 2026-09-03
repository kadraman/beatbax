# Implementation Plan: Virtual Piano Keyboard for Desktop note preview

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

### Desktop Changes

- Replace the static note-label preview strip with a keyboard icon and expandable keyboard panel in the Desktop React shell.
- Add a virtual keyboard component that renders note keys and handles click/tap input.
- Wire preview note events from mouse, computer keyboard, and MIDI input into one shared highlight path (reuse Desktop MIDI audition from `midi-step-entry-controller` where practical).
- Add keyboard state to the relevant Desktop panel/store.
- Integrate optional scale-aware key styling using the existing scale-awareness data.
- Gate behind Desktop capabilities (same class of feature as MIDI step entry); do not ship on web-lite.

### Accessibility

- The keyboard icon must have an accessible name and keyboard activation support.
- Keys must be reachable by keyboard and expose a clear role or equivalent semantic structure.
- The currently active note should be announced in a way that works for assistive technology.
- Color alone must not be the only indicator of scale membership or active preview.

### Data / State

- Track the currently previewed note identity, source input type, and active range.
- Track whether the keyboard panel is open or collapsed.
- Reuse existing Desktop MIDI enablement state rather than creating a separate MIDI preference model.

### Documentation Updates

- Add a user-facing explanation of the keyboard icon and input mappings in the Desktop / MIDI docs.
- Update any tutorial or feature overview content that still references static note labels as the primary preview mechanism.

---

## Testing Strategy

### Unit Tests

- Toggling the keyboard icon opens and closes the virtual keyboard.
- Clicking a virtual key emits the correct preview note.
- Computer-keyboard input maps to the expected note.
- MIDI note events resolve to the same key highlight as UI input.
- Scale-aware styling reflects in-scale and out-of-scale state correctly.

### Integration Tests

- Desktop renders the keyboard icon in place of the old static preview labels.
- Preview highlight updates correctly when notes are triggered from different input paths.
- The keyboard stays usable in narrow Desktop panels.
- The component works with the scale-awareness state when that feature is enabled.
- Web-lite does not expose the keyboard.

---

## Migration Path

- Keep the current note preview behavior available until the virtual keyboard is ready to replace it.
- Ship the keyboard icon and expanded view as a non-breaking Desktop UI change.
- Preserve existing preview note triggering so current workflows continue to work.

---
