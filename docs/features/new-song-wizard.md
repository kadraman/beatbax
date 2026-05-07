---
title: "Web UI New Song Wizard"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-07
issue: "https://github.com/kadraman/beatbax/issues/106"
---

## Summary

Add a guided New Song Wizard to the BeatBax Web UI that appears when users choose `File => New` or click the toolbar New icon.

The wizard helps users create a new song for a selected sound chip using plugin-provided defaults and templates. It also provides an alternate path to open an existing song.

The wizard must also auto-open on first run.

---

## Problem Statement

Creating a new song currently requires users to manually choose a chip, remember defaults, and build initial content by hand.

This causes friction, especially for:

- first-time users who are unfamiliar with chip capabilities
- users switching between chip backends
- users who want a quick, structured starting point

The system already supports pluggable chips and settings defaults, so new-song onboarding should leverage those contracts instead of hard-coded UI choices.

---

## Proposed Solution

### Summary

Implement a modal wizard in the Web UI that is launched from new-song entry points and on first run.

The wizard must provide:

- sound chip navigator populated from enabled chip plugins (not hard-coded)
- song name input
- song artist input defaulted from settings
- song description input
- song tags (optional)
- BPM input defaulted from settings
- create instruments selector
- create named effects selector
- create structure selector
- alternate action to open an existing song instead of creating a new one

When a chip is selected, the wizard displays plugin-provided chip summary metadata:

- computer/console
- year
- channel summary
- small platform image

Each chip plugin must also provide template options/content for:

- instruments
- named effects
- structure

When the song is created, all of the above information should be used together we
inclusion of additional comments (where applicable)

### UX Flow

1. User triggers `File => New` or toolbar New.
2. Wizard modal opens.
3. User chooses either:
   - `Create New Song`, or
   - `Open Existing Song`
4. If creating new:
   - user selects chip from enabled chips list
   - chip summary panel updates to selected chip
   - user confirms song fields and template selectors
5. User confirms create action.
6. Web UI initializes a new song document from selected plugin + wizard selections.

If this is first run, step 1 is replaced by automatic wizard launch at startup.

### UI Style Constraint

The wizard must follow existing BeatBax modal styling conventions (matching dialogs like Settings), but without left-side section navigation.

---

## Plugin Contract Requirements

The wizard depends on plugin-provided metadata and starter templates. The Web UI must consume plugin contracts rather than embedding chip-specific logic.

Required plugin-provided fields for wizard display:

- chip display name
- target platform/computer or console label
- release year (or era label)
- channel summary
- small representative image asset (or image reference)

Required plugin-provided wizard templates:

- instruments template options/content
- named effects template options/content
- structure template options/content

Core/plugin boundary rule:

- core Web UI orchestrates wizard flow
- plugins provide chip metadata and chip-specific starter content
- core must not hard-code per-chip details
- each plugin should provide an encoded image asset (or default one will be used if not available)

---

## Data Defaults and Settings Integration

The wizard must prefill values from user settings where available:

- `song artist` default from settings
- `bpm` default from settings
- chip navigator entries based on chips currently enabled in settings

If defaults are missing, the wizard should use safe project defaults and keep inputs editable.
A new field in settings should be created for storing `song artist`.

---

## First-Run Behavior

On first run of BeatBax Web UI, display the New Song Wizard automatically.

Expected behavior:

- first-run detection stored in user settings/local state
- wizard opens once automatically for onboarding
- user may choose `Open Existing Song` instead of creating a new song

---

## Implementation Plan

### AST Changes

No AST changes required.

### Parser Changes

No parser changes required.

### CLI Changes

No CLI changes required.

### Web UI Changes

- Add `NewSongWizard` modal and launch actions.
- Wire `File => New` and toolbar New to wizard open action.
- Add first-run startup check and auto-open behavior.
- Add chip navigator bound to enabled chips settings + plugin registry.
- Add chip summary panel populated from selected plugin metadata.
- Add inputs for song name, artist, BPM with settings defaults.
- Add selectors for instruments, named effects, and structure from plugin templates.
- Add alternate `Open Existing Song` path from wizard.
- Ensure modal styling aligns with existing settings dialog visual language, without left-side sections.

### Export Changes

No export changes required.

### Documentation Updates

- Keep this feature specification updated as implementation details are finalized.
- Add user-facing help text for new-song and first-run wizard behavior in UI docs.

---

## Testing Strategy

### Unit Tests

- chip navigator only includes enabled chips
- chip selection updates summary panel metadata correctly
- artist and BPM initialize from settings defaults
- selectors populate from plugin-provided templates
- create payload includes selected templates and song fields
- open-existing path routes correctly from wizard
- first-run flag behavior (auto-open once)

### Integration Tests

- `File => New` opens wizard modal
- toolbar New opens wizard modal
- full create flow initializes new song using selected chip plugin and template choices
- plugin with missing required metadata fails with clear diagnostic
- first-run startup path opens wizard and respects dismissal/completion state

### Regression Tests

- existing open-song flows remain unaffected
- creating songs without wizard invocation is not available unless explicitly retained by design
- no hard-coded chip data introduced in Web UI

---

## Migration Path

No migration required.

This is an additive UX and onboarding feature for Web UI song creation.

---

## Implementation Checklist

- [ ] Define/confirm plugin metadata contract for wizard chip summary
- [ ] Define/confirm plugin template contract for instruments/effects/structure selectors
- [ ] Implement wizard modal shell and launch wiring
- [ ] Implement chip navigator driven by enabled chips
- [ ] Implement summary panel driven by selected plugin metadata
- [ ] Implement song fields with settings-derived defaults
- [ ] Implement selector controls for instruments/effects/structure
- [ ] Implement `Open Existing Song` alternate flow
- [ ] Implement first-run detection and auto-launch behavior
- [ ] Align final visual design with existing modal style constraints
- [ ] Add unit and integration tests
- [ ] Update UI documentation/help text

---

## Open Questions

- Should plugin summary image be required, or optional with a fallback asset?
> Yes, but a fallback image should also be displayed if not available
- Should template selectors support `None` for each category, or always require one option?
- Should first-run wizard auto-open only in Web UI, or also in future desktop UI?
> Noth
- Should `Open Existing Song` close the wizard and immediately trigger file picker, or navigate to an existing open flow screen?

---

## References

- `docs/features/FEATURE_TEMPLATE.md`
- Existing Web UI modal styling patterns (for example, settings dialog)

## Additional Notes

This feature is intentionally plugin-first and must preserve the core/plugin architecture:

- no hard-coded chip assumptions in the wizard
- chip-specific content remains plugin-owned
- wizard behavior remains deterministic from settings + selected plugin data
