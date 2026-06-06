---
title: "Virtual Piano Keyboard for Web UI note preview"
status: proposed
authors: ["GitHub Copilot"]
created: 2026-06-05
issue: "https://github.com/kadraman/beatbax/issues/133"
---

## Summary

Add a **virtual piano keyboard** to the Web UI as an interactive note-preview surface. Instead of showing static note labels such as `C3 | C4 | C5` above the instrument, the UI shows a keyboard icon that expands into a clickable piano keyboard when activated.

The keyboard supports three preview paths:

- Clicking a virtual key previews that note.
- Pressing a mapped computer-keyboard shortcut previews the same note.
- Playing a MIDI keyboard previews the same note when MIDI input is enabled.

Any active note preview highlights the corresponding virtual key so the user can see what is being triggered at a glance.

This feature is designed to work cleanly with the existing **scale awareness** feature so in-scale notes can be highlighted or emphasized while out-of-scale notes can be visually distinguished.

---

## Problem Statement

The current note-preview affordance is text-only and does not provide a strong spatial relationship between pitches and user input. That creates several limitations:

- Users cannot visually explore intervals and note relationships quickly.
- The preview UI is not consistent with the way musicians think about note entry and auditioning.
- Computer keyboard and MIDI keyboard preview paths are not represented in the UI as a single interactive instrument.
- Scale-aware guidance is difficult to present clearly when the preview surface is only static note labels.

A virtual keyboard gives the Web UI a more direct auditioning surface for instruments, scales, and note entry workflows.

---

## Proposed Solution

Replace the static `C3 | C4 | C5 ...` preview labels above the instrument area with a compact **keyboard icon** that opens a virtual piano keyboard.

### Summary

- The keyboard icon is shown in the same location where the note preview labels currently appear.
- Clicking the icon expands the virtual keyboard inline or in a small popover-style panel, depending on available space.
- The keyboard displays a selectable range of notes relevant to the current instrument and octave context.
- Keys can be clicked with the mouse or touch input to preview a note.
- Mapped computer keys trigger the same preview notes.
- MIDI keyboard input, when enabled, triggers the same preview notes.
- The active key is highlighted whenever a note is triggered from any supported input path.
- Scale awareness can optionally influence key styling so the user can see in-scale vs out-of-scale notes.

### Interaction model

| Input | Behavior |
|---|---|
| Keyboard icon click | Toggle the virtual keyboard open/closed |
| Virtual key click/tap | Preview the corresponding note |
| Computer-keyboard shortcut | Preview the mapped note and highlight the key |
| MIDI keyboard input | Preview the corresponding note and highlight the key |
| Active preview ends | Remove highlight after note-off / preview timeout |

### Visual states

- **Idle**: keyboard visible, no note highlighted.
- **Active preview**: the triggered key is highlighted with the channel or instrument accent.
- **Scale-aware**: in-scale keys use the active scale styling; out-of-scale keys are visually distinct but still available unless the scale feature explicitly disables them.
- **Unavailable input**: if MIDI is disabled or unavailable, the virtual keyboard still works with mouse and mapped computer keys.

### Layout guidance

- Keep the keyboard compact enough to fit above or near the instrument controls in the Web UI.
- Prefer a responsive layout that can collapse or scroll horizontally on narrow screens.
- Preserve the existing instrument workflow; the keyboard should augment note preview rather than replace editing controls.

---

## Keyboard Mapping

The Web UI should maintain a stable mapping between physical keyboard input and musical notes.

### Requirements

- The mapping must be deterministic and visible in the UI, either through tooltips, labels, or an accessible help hint.
- White and black keys should each map to a corresponding note in the selected preview range.
- The mapping should be easy to extend if the application later supports alternate layouts or octave shifting.
- The mapping should not require the user to enable the virtual keyboard to use computer-keyboard preview.

### Suggested behaviors

- Default mapping follows the current note-preview range.
- If the preview range spans multiple octaves, the mapping should preserve relative pitch order.
- If the scale-awareness feature is enabled, mapped notes should still trigger even when they are outside the active scale, but they should be styled distinctly if that is the chosen UI policy.

---

## MIDI Integration

If MIDI keyboard preview is enabled, incoming MIDI note-on and note-off messages should drive the same highlight and preview path as mouse and computer-keyboard input.

### Requirements

- MIDI input must map to the same note identity used by the virtual keyboard.
- The highlighted key must update immediately on MIDI note-on.
- The highlight must clear on MIDI note-off or equivalent timeout behavior.
- MIDI preview should be optional and respect the user’s existing MIDI enablement settings.

---

## Scale Awareness Integration

This feature is expected to work alongside [`scale-awareness.md`](complete/scale-awareness.md).

### Intended relationship

- The virtual keyboard can display scale membership for the current song scale.
- In-scale notes can be emphasized, while out-of-scale notes can be dimmed or marked.
- The keyboard should reflect scale changes without requiring a page reload.
- Previewing a note should still work regardless of scale styling, unless a separate enforcement rule explicitly blocks it.

### Suggested UI signals

- Active scale root and mode may be shown in a compact label above the keyboard.
- In-scale notes can use a stronger accent or filled key style.
- Out-of-scale notes can remain selectable but subdued.

---

## Implementation Plan

### Web UI Changes

- Replace the static note-label preview strip with a keyboard icon and expandable keyboard panel.
- Add a virtual keyboard component that renders note keys and handles click/tap input.
- Wire preview note events from mouse, computer keyboard, and MIDI input into one shared highlight path.
- Add keyboard state to the relevant Web UI store or panel state.
- Integrate optional scale-aware key styling using the existing scale-awareness data.

### Accessibility

- The keyboard icon must have an accessible name and keyboard activation support.
- Keys must be reachable by keyboard and expose a clear role or equivalent semantic structure.
- The currently active note should be announced in a way that works for assistive technology.
- Color alone must not be the only indicator of scale membership or active preview.

### Data / State

- Track the currently previewed note identity, source input type, and active range.
- Track whether the keyboard panel is open or collapsed.
- Reuse existing MIDI enablement state rather than creating a separate MIDI preference model.

### Documentation Updates

- Add a user-facing explanation of the keyboard icon and input mappings in the web-ui docs.
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

- The Web UI renders the keyboard icon in place of the old static preview labels.
- Preview highlight updates correctly when notes are triggered from different input paths.
- The keyboard stays usable on narrow screens.
- The component works with the scale-awareness state when that feature is enabled.

---

## Migration Path

- Keep the current note preview behavior available until the virtual keyboard is ready to replace it.
- Ship the keyboard icon and expanded view as a non-breaking UI change.
- Preserve existing preview note triggering so current workflows continue to work.

---

## Implementation Checklist

- [ ] Replace static note-label preview with a keyboard icon entry point.
- [ ] Implement an expandable virtual keyboard component.
- [ ] Wire mouse/touch preview handling.
- [ ] Wire computer-keyboard preview handling.
- [ ] Wire MIDI preview handling when MIDI is enabled.
- [ ] Highlight the active key for all preview sources.
- [ ] Add optional scale-aware styling and state sync.
- [ ] Add accessibility semantics and keyboard support.
- [ ] Add unit and integration tests.
- [ ] Update Web UI documentation and tutorials.

---

## Future Enhancements

- Octave shift controls for the preview range.
- Alternate keyboard layouts for different play styles.
- Chord preview and chord highlighting.
- Persistent user preference for compact vs expanded keyboard display.
- Note-range zoom for instruments with wider preview spans.

---

## Open Questions

1. Should the virtual keyboard open inline or in a popover by default?
2. Should out-of-scale notes be selectable but dimmed, or disabled when scale awareness is active?
3. Should the keyboard remember the last opened state per session or per user preference?
4. Should computer-keyboard mappings be shown directly on the key caps or in a legend above the keyboard?

---

## References

- Scale awareness: [`docs/features/complete/scale-awareness.md`](complete/scale-awareness.md)
- Web UI docs: [`docs/ui/`](../ui/)
- MIDI importer: [`docs/features/midi-importer.md`](midi-importer.md)
- Existing Web UI preview area: instrument and note preview controls in the web-ui panel

---

## Additional Notes

This feature is intentionally focused on preview and auditioning, not on changing song structure or replacing the editor’s note-entry model. The goal is to make note discovery and auditioning feel like playing an instrument while preserving the existing BeatBax workflow.
