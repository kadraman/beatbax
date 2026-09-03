# Implementation Plan: DAW-Style Horizontal Channel Mixer with VU Meters

**Spec**: [spec.md](spec.md) | **Updated**: 2026-09-03

## Summary

Replace the vertical side-panel channel mixer with a bottom-docked horizontal DAW-style strip and per-channel VU meters driven by `AnalyserNode` taps.

## Technical context

- **Packages / surfaces**: `apps/desktop` (primary), shared panel logic historically in `apps/web-ui` / `packages/app-core`; channel mute/solo via `channelStates`
- **Language**: TypeScript, Vite, Tailwind / existing panel styles
- **Testing**: Existing unit tests must keep passing; add component/store tests where practical
- **Client profile**: desktop-full (and web-ui if mixer host still shared)
- **Depends on**: per-channel analyser taps ([docs/features/complete/per-channel-analyser.md](../../../docs/features/complete/per-channel-analyser.md))

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — **N/A** (UI only)
- [x] AST / ISM / scheduler / expansion impact identified — **N/A**
- [x] Plugins remain isolated; core does not gain plugin dependencies — volume lock uses chip capability flags only
- [x] Determinism and compatibility preserved — mute/solo continue via existing store
- [x] Tests planned for new behavior — see Testing strategy

## Project structure

- New mixer component (e.g. `DawMixer`) replacing / superseding `channel-mixer.ts` for bottom dock
- Layout host below three-pane layout (`#bb-mixer-host` or desktop equivalent)
- Analyser API: `playbackEngine.getChannelAnalyser(channelId)`

## Implementation

### UI

- Horizontal strips: label, colour accent, VU (12 segments), inst name, volume fader, Mute/Solo
- Pattern/sequence names stay in Song Visualizer (not strips) per acceptance criteria
- Resize handle, collapse/expand, `Ctrl+Shift+M` visibility toggle; persist in `localStorage`
- Light + dark styles

### Audio metering

- RAF ~30 fps reading analyser data; peak-hold ~1.5 s
- Idle/zero when analyser is null or playback stopped

### Migration

1. Keep legacy `ChannelMixer` during development; remove after parity
2. Hide old right-pane mixer by default; optional `panel.channel-mixer-legacy` flag

## Testing strategy

### Unit / component

- Mute/solo wiring still updates `channelStates`
- Collapse/expand and visibility persistence

### Manual / QA

- Acceptance criteria in [spec.md](spec.md)
- Dark and light modes; Game Boy fader locked; live VU during playback

## Migration and compatibility

No language/export changes. Existing mute/solo/glyph margin behaviour must not regress.

## Open implementation questions

None blocking; follow acceptance criteria in the spec.
