# Tasks: DAW-Style Horizontal Channel Mixer with VU Meters

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Shipped as `DesktopChannelMixer` (`apps/desktop/.../DesktopChannelMixer.tsx`). Analyser API is `getChannelAnalyserData`.

## Phase 0: Foundation

- [x] T001 Confirm per-channel `AnalyserNode` API is available (`getChannelAnalyser`)
- [x] T002 Add bottom mixer host to app layout (desktop / shared shell)

## Phase 1: Strip UI

- [x] T010 [P] [US1] Implement `DawMixer` horizontal strips (label, colour, M/S, inst name)
- [x] T011 [P] [US1] Wire mute/solo to existing `channelStates` store
- [x] T012 [US1] Volume fader with chip capability lock (GB greyed out)
- [x] T013 [US1] Resize handle + collapse/expand; persist height/collapsed in `localStorage`
- [x] T014 [US1] View toggle `Ctrl+Shift+M`; persist visibility

## Phase 2: VU meters

- [x] T020 [US2] RAF metering loop (~30 fps) from per-channel analysers
- [x] T021 [US2] 12-segment green/yellow/red + ~1.5 s peak-hold
- [x] T022 [US2] Idle state when stopped / analyser null

## Phase 3: Migration and polish

- [x] T030 Hide legacy right-pane mixer by default; optional legacy flag
- [x] T031 Light-mode styles for all new elements
- [x] T032 Verify acceptance criteria in [spec.md](spec.md); remove legacy mixer when at parity
- [x] T033 Move to `specs/complete/004-daw-channel-mixer/` and update `specs/STATUS.md` when shipped
