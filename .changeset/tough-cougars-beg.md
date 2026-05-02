---
"@beatbax/plugin-chip-nes": minor
"@beatbax/plugin-chip-sms": minor
"@beatbax/engine": minor
"@beatbax/cli": patch
---

@beatbax/plugin-chip-sms:
New SMS PSG chip plugin for the Sega Master System / Game Gear SN76489 APU.

@beatbax/plugin-chip-nes:
Added NTSC/PAL clock region support for the NES Ricoh 2A03 APU.

@beatbax/engine
Added chip region qualifier and per-chip effect dispatch to the core engine.

@beatbax/cli
Updated CLI package dependency on engine to pick up chipRegion support and chip-specific effect dispatch.
