# Implementation Plan: Performance Mode Video Recording

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan



### Engine

1. Expose post-limiter (or master) output node for recording taps without breaking the speaker path.
2. Ensure reconnect / dispose of the player does not leave dangling `MediaStreamDestination` connections.



### App-core

1. Add `StorageKey`s for all Performance recording settings (format, resolution, fps, qualities, title card, HUD, save mode, fixed folder, last folder, filename stem).
2. Add matching settings atoms (same pattern as `settingVizBgEffect`).



### Desktop

1. Add Performance recording section to General settings (gated on Song Visualizer feature).
2. Implement `performance-recorder/` module: compositor, title-card opacity timeline, WebCodecs session, mux finalize → `Uint8Array`.
3. Wire Record on the **normal** toolbar (kick-start → performance mode + record from start, loop off, play once, auto-stop on song end) and Record/Stop on the **performance** toolbar with the same one-shot rules; respect auto-hide chrome.
4. Extend save IPC for `.mp4` / `.webm` filters and directory picker for fixed-folder mode.
5. On exit performance while recording: finalize and run configured save path.



### Documentation

1. This feature doc (proposed → implemented when shipped).
2. Brief user-facing note in desktop help / release notes when complete.



### Out of scope for this implementation pass

Web clients, offline render pipeline, end cards, custom title text editor.

---

## Testing Strategy



### Manual

- Record MP4 and WebM; open in VLC / system player; check A/V sync and clean frames (no M/S / toolbar).
- Change resolution / fps / quality between takes and verify output.
- Title card on/off; channel HUD on/off.
- Save modes: `ask`, `last-folder`, `fixed-folder`.
- Mute mid-take affects recorded audio.
- Kick-start and in-PM Record both restart from the beginning with loop off; recording auto-stops at song end (one playthrough).
- Exit performance while recording respects save mode.
- Unsupported codec path shows a Settings-oriented error.



### Automated (light)

- Unit tests for even-dimension clamping, resolution mapping, filename `{name}` expansion, title-card opacity timeline helpers if extracted.
- Desktop typecheck after adding muxer packages.

---

## Migration Path

No migration. New settings default as in the table above. Existing songs need no AST changes; metadata already supports `name` / `artist`.

---
