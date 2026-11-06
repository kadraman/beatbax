# Sound chip and exporter roadmap

This roadmap lists the sound chips and exporters BeatBax ships today, and the ones planned next. It is product direction, not an engineering spec. New chip or exporter work still needs a feature folder under [`specs/features/`](specs/features/).

Platform or computer name comes first, with the chipset in brackets. Each chip row names one main exporter. [WAV](#wav), [MIDI](#midi), and [JSON](#json) are built in for every chip and are not repeated on those rows.

## Principles

- Prefer chips with an active chiptune scene.
- Game Boy and NES are built into `@beatbax/engine`. Later chips ship as optional plugins.
- Sound chip status uses the same badges as Settings and the New Song Wizard: **Stable**, **Beta**, **Experimental**.
- Exporter status uses those same words. Exporters do not have a separate Settings badge.
- Exclude purely sample-based streaming hardware (e.g. Amiga, and similar).

## Sound chips

### Available

| Sound chip | Delivery | Status | Directive | Main export |
|---|---|---|---|---|
| <a id="chip-gameboy"></a>[Game Boy](https://en.wikipedia.org/wiki/Game_Boy) (DMG-01) | Built-in | Stable | `chip gameboy` | [hUGETracker](#hugetracker) |
| <a id="chip-nes"></a>[NES](https://en.wikipedia.org/wiki/Nintendo_Entertainment_System) / Famicom ([Ricoh 2A03](https://en.wikipedia.org/wiki/Ricoh_2A03)) | Built-in | Beta | `chip nes` | [FamiTracker](#famitracker) |
| <a id="chip-sms"></a>[Sega Master System](https://en.wikipedia.org/wiki/Master_System) / [Game Gear](https://en.wikipedia.org/wiki/Game_Gear) ([SN76489](https://en.wikipedia.org/wiki/Texas_Instruments_SN76489)) | Plugin | Beta | `chip sms` / `chip gg` | [VGM](#vgm) |
| <a id="chip-spectrum"></a>[ZX Spectrum 128](https://en.wikipedia.org/wiki/ZX_Spectrum) / [Amstrad CPC](https://en.wikipedia.org/wiki/Amstrad_CPC) ([AY-3-8912](https://en.wikipedia.org/wiki/General_Instrument_AY-3-8910)) | Plugin | Experimental | `chip spectrum-128` / `chip cpc` | [Arkos Tracker](#arkos) |

**Built-in** chips are part of `@beatbax/engine`. **Plugin** chips are separate packages: `@beatbax/plugin-chip-sms` and `@beatbax/plugin-chip-spectrum-128`.

### Planned

None of these have a plugin yet. Order is impact against effort.

| Sound chip | Effort | Status | Main export | Notes |
|---|---|---|---|---|
| [Atari ST](https://en.wikipedia.org/wiki/Atari_ST) ([YM2149](https://en.wikipedia.org/wiki/General_Instrument_AY-3-8910)) | Low–Medium | Planned | — | AY-family PSG with ST timing |
| [MSX](https://en.wikipedia.org/wiki/MSX) ([YM2413](https://en.wikipedia.org/wiki/Yamaha_YM2413)) | Medium | Planned | — | Preset 2-operator FM (OPLL) |
| [IBM PC](https://en.wikipedia.org/wiki/IBM_Personal_Computer) ([AdLib](https://en.wikipedia.org/wiki/Ad_Lib,_Inc.) / [YM3812](https://en.wikipedia.org/wiki/Yamaha_YM3812)) | Medium | Planned | — | OPL2 patches and operators |
| [Sega Mega Drive / Genesis](https://en.wikipedia.org/wiki/Sega_Genesis) ([YM2612](https://en.wikipedia.org/wiki/Yamaha_YM2612) + [SN76489](https://en.wikipedia.org/wiki/Texas_Instruments_SN76489)) | High | Planned | — | [Spec 023](specs/features/023-sega-mega-drive-chip-plugin/spec.md) — `@beatbax/plugin-chip-genesis` |
| <a id="chip-c64"></a>[Commodore 64](https://en.wikipedia.org/wiki/Commodore_64) ([SID 6581/8580](https://en.wikipedia.org/wiki/MOS_Technology_SID)) | High | Planned | [GoatTracker](#goattracker) | [Spec 009](specs/features/009-c64-sid-chip-plugin/spec.md) — `@beatbax/plugin-chip-sid` |
| [Atari 8-bit](https://en.wikipedia.org/wiki/Atari_8-bit_computers) ([POKEY](https://en.wikipedia.org/wiki/POKEY)) | Medium | Planned | — | Four voices with distortion and noise |
| [PC Engine / TurboGrafx-16](https://en.wikipedia.org/wiki/TurboGrafx-16) (HuC6280) | Medium | Planned | — | Six waveform channels |
| [SAM Coupé](https://en.wikipedia.org/wiki/SAM_Coup%C3%A9) ([SAA1099](https://en.wikipedia.org/wiki/Philips_SAA1099)) | Medium | Planned | — | Stereo PSG |

## Exporters

### Available

| Exporter | Delivery | Status | Format | Chips |
|---|---|---|---|---|
| <a id="wav"></a>[WAV](https://en.wikipedia.org/wiki/WAV) | Built-in | Stable | `.wav` | All |
| <a id="midi"></a>[MIDI](https://en.wikipedia.org/wiki/MIDI) | Built-in | Stable | `.mid` | All |
| <a id="json"></a>[JSON](https://en.wikipedia.org/wiki/JSON) | Built-in | Stable | ISM `.json` | All |
| <a id="hugetracker"></a>[hUGETracker](https://superdisk.github.io/hUGETracker/) | Built-in | Stable | `.uge` | [Game Boy](#chip-gameboy) |
| <a id="famitracker"></a>[FamiTracker](http://www.famitracker.com/) | Plugin | Stable | text `.txt` | [NES / Famicom](#chip-nes) |
| <a id="vgm"></a>[VGM](https://vgmrips.net/) | Plugin | Beta | `.vgm` | [Sega Master System / Game Gear](#chip-sms) |
| <a id="arkos"></a>[Arkos Tracker](https://www.julien-nevo.com/arkostracker/) | Plugin | Experimental | `.aks` | [ZX Spectrum 128 / Amstrad CPC](#chip-spectrum) |

**Built-in** exporters are part of `@beatbax/engine`. **Plugin** exporters are `@beatbax/plugin-exporter-famitracker`, `@beatbax/plugin-exporter-vgm`, and `@beatbax/plugin-exporter-arkos`.

JSON writes the internal song model. FamiTracker export is the text format, not binary `.ftm`. VGM currently covers SMS and Game Gear; the AY backend is not implemented. Arkos export covers simple tone songs. Macros, buzz bass, and inline effects are still planned ([spec 020](specs/features/020-spectrum-cpc-arkos-exporter-phase-2/spec.md)).

### Planned

| Exporter | Status | Format | Chips | Notes |
|---|---|---|---|---|
| <a id="goattracker"></a>[GoatTracker](http://covertbitops.c64.org/) | Planned | Song data | [Commodore 64](#chip-c64) | Main homebrew export. [Spec 010](specs/features/010-c64-sid-goattracker-exporter/spec.md) — `@beatbax/plugin-exporter-goattracker` |
| <a id="psid"></a>[PSID / RSID](https://en.wikipedia.org/wiki/High_Voltage_SID_Collection) | Planned | `.sid` | [Commodore 64](#chip-c64) | Playback and archival export. [Spec 011](specs/features/011-c64-sid-psid-rsid-exporter/spec.md) — `@beatbax/plugin-exporter-sid` |
