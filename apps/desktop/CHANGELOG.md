# BeatBax Desktop changelog

Notes for stable `desktop-v*` GitHub Releases, generated from pull request titles. Rolling development builds are published on the [Development pre-release](https://github.com/kadraman/beatbax/releases/tag/desktop-dev).

## 0.4.0 — 2026-11-04

## What's Changed
* feat(desktop): Pattern Grid navigation and scrolling — click a pattern block to highlight every use and jump to it in the editor
* feat(desktop): Pattern Grid zoom and horizontal scroll for long songs
* feat(008): add section/form composition and Beginner Mode sugar by @kadraman in https://github.com/kadraman/beatbax/pull/235
* feat(098/099): instrument editor preview pitch and Live edit draft by @kadraman in https://github.com/kadraman/beatbax/pull/231
* feat(093): implement desktop remote imports via main-process IPC by @kadraman in https://github.com/kadraman/beatbax/pull/228
* feat(014): Pattern Grid seek and loop at pattern boundaries by @kadraman in https://github.com/kadraman/beatbax/pull/225
* feat(092): warn on same-file duplicate definitions; Copilot repairs or blocks duplicate Edit replies by @kadraman in https://github.com/kadraman/beatbax/pull/224
* feat(088): Copilot request controls and budget diagnostics by @kadraman in https://github.com/kadraman/beatbax/pull/223
* fix(desktop): restore pre-edit song when Copilot Discard remaining keeps nothing by @kadraman in https://github.com/kadraman/beatbax/pull/221
* feat(091): desktop developer tools opt-in and diagnostics log by @kadraman in https://github.com/kadraman/beatbax/pull/220
* feat(017, 019, 024): Copilot edit-apply hardening, DMC load warnings, granular CodeLens settings by @kadraman in https://github.com/kadraman/beatbax/pull/219
* feat(089, 090): arrangement-aware MIDI import and readable generated names by @kadraman in https://github.com/kadraman/beatbax/pull/215
* feat(006): CLI MIDI → .bax conversion by @kadraman in https://github.com/kadraman/beatbax/pull/208


**Full Changelog**: https://github.com/kadraman/beatbax/compare/desktop-v0.3.0...desktop-v0.4.0

## 0.3.0 — 2026-09-12

## What's Changed

- feat(ins): support native `subpat` declarations in `.ins` imports by @kadraman in https://github.com/kadraman/beatbax/pull/174
- Instrument Imports fix for CodeLens preview and support for importing named effects by @kadraman in https://github.com/kadraman/beatbax/pull/176
- feat(desktop): Implement document file watcher and external reload handling in BeatBax Desktop by @kadraman in https://github.com/kadraman/beatbax/pull/178
- chore: Update documentation and CI workflows for desktop releases by @kadraman in https://github.com/kadraman/beatbax/pull/179
- Merge chore/GitHub desktop dev release by @kadraman in https://github.com/kadraman/beatbax/pull/180
- docs: refresh #171 export import-merge spec for current code by @kadraman in https://github.com/kadraman/beatbax/pull/181
- fix(app-core): merge import kits before Desktop export (#171) by @kadraman in https://github.com/kadraman/beatbax/pull/184
- feat(uge): implement pattern reuse and optimization in UGE export by @kadraman in https://github.com/kadraman/beatbax/pull/187
- feat(copilot): add sessions, context meter, and per-change edit review by @kadraman in https://github.com/kadraman/beatbax/pull/188
- feat(cli): add instrument extraction command for UGE files by @kadraman in https://github.com/kadraman/beatbax/pull/194
- feat(desktop): add Pattern Grid section focus and arrangement slice playback by @kadraman in https://github.com/kadraman/beatbax/pull/195
- feat(desktop): enhance section focus and playback features in Pattern Grid by @kadraman in https://github.com/kadraman/beatbax/pull/196
- refactor(desktop): streamline command palette and enhance feature context by @kadraman in https://github.com/kadraman/beatbax/pull/197
- Migrate feature specifications to the SDD tree by @kadraman in https://github.com/kadraman/beatbax/pull/198
- feat(desktop): Instrument Editor panel with MIDI audition (#169) by @kadraman in https://github.com/kadraman/beatbax/pull/206
- feat(desktop, web-ui): enhance Channel Mixer functionality and styling by @kadraman in https://github.com/kadraman/beatbax/pull/207

**Full Changelog**: https://github.com/kadraman/beatbax/compare/desktop-v0.2.0...desktop-v0.3.0

## 0.2.0 — 2026-08-09

## What's Changed

- feat(desktop): miscellaneous updates and improvements to desktop experience by @kadraman in https://github.com/kadraman/beatbax/pull/140
- Incorporate Desktop Client Enhancement Phase 5b1 to 5b-4 by @kadraman in https://github.com/kadraman/beatbax/pull/145
- Desktop web UI retirement phases 1-4 by @kadraman in https://github.com/kadraman/beatbax/pull/146
- Implement remaining phases of Desktop Web-UI retirement by @kadraman in https://github.com/kadraman/beatbax/pull/147
- Incorporate chip song profiles and hugetracker export improvements by @kadraman in https://github.com/kadraman/beatbax/pull/148
- Exporter Buffer Return Cleanup by @kadraman in https://github.com/kadraman/beatbax/pull/153
- Gameboy Noise Parity between BeatBax and hugeTracker by @kadraman in https://github.com/kadraman/beatbax/pull/154
- Incorporate BeatBax Copilot updates by @kadraman in https://github.com/kadraman/beatbax/pull/155
- feat: enhance document save state management and Copilot integration by @kadraman in https://github.com/kadraman/beatbax/pull/156
- feat: enhance macOS build process and menu functionality by @kadraman in https://github.com/kadraman/beatbax/pull/157
- Improve autosave, shared shortcuts, and Song Visualizer performance UX by @kadraman in https://github.com/kadraman/beatbax/pull/158
- Implement DMC remote sample loading by @kadraman in https://github.com/kadraman/beatbax/pull/159
- Support for Gameboy subpatterns when exported to Hugetracker by @kadraman in https://github.com/kadraman/beatbax/pull/160
- feat(arkos): initial .aks/.aki exporter for Spectrum/CPC songs by @kadraman in https://github.com/kadraman/beatbax/pull/163
- Enhance chip card metadata and preview functionality by @kadraman in https://github.com/kadraman/beatbax/pull/164
- fix(desktop): allow spaces in Default song artist setting by @kadraman in https://github.com/kadraman/beatbax/pull/165
- Fix toolbar click/hover reliability and add Settings shortcut. by @kadraman in https://github.com/kadraman/beatbax/pull/166
- chore: add gpg signing and documentation on overall signing status by @kadraman in https://github.com/kadraman/beatbax/pull/168

**Full Changelog**: https://github.com/kadraman/beatbax/compare/desktop-v0.1.0...desktop-v0.2.0

## 0.1.0 — 2026-06-14

Initial BeatBax Desktop release (native Electron client). See the [desktop-v0.1.0 GitHub Release](https://github.com/kadraman/beatbax/releases/tag/desktop-v0.1.0) for installers and auto-generated notes.
