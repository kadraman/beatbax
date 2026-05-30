# C64 SID Hardware Guide

This guide documents the Commodore 64 SID target in BeatBax. The SID is a three-voice synthesizer with per-voice oscillator and ADSR controls, plus chip-global filter and volume state.

BeatBax treats SID as an explicit C64 target with named chip-model and region profiles rather than a vague generic synth.

## Hardware Summary

| Property | Value |
|---|---|
| Chip family | MOS 6581 / MOS 8580 SID |
| Target platform | Commodore 64 |
| Voices | 3 |
| Waveforms | Triangle, saw, pulse, noise |
| Pulse width | Per voice |
| ADSR | Per voice |
| Filter | One shared multimode analog-style filter |
| Master volume | One shared global volume control |
| Region profiles | PAL and NTSC |

## Voice and Global Ownership Rules

SID composition is constrained by both per-voice and chip-global resources:

- Frequency, gate, waveform, ADSR, and pulse width are voice-local.
- Filter cutoff, resonance, and mode are chip-global.
- Filter routing is chip-global state deciding which voices feed the shared filter.
- Master volume is global.
- Oscillator sync and ring modulation are inter-voice features and depend on oscillator relationships, not isolated note state.

This is why a correct BeatBax SID target must use one shared chip instance per song session.

## Voice Summary

| Voice resource | Scope | Notes |
|---|---|---|
| Frequency | Per voice | Pitch control written independently per voice |
| Gate | Per voice | Starts/stops ADSR behavior |
| Waveform select | Per voice | Triangle, saw, pulse, or noise |
| Pulse width | Per voice | Only meaningful with pulse waveform |
| ADSR | Per voice | Attack, decay, sustain, release |
| Sync | Inter-voice | Depends on neighboring oscillator relationship |
| Ring modulation | Inter-voice | Depends on another oscillator phase relationship |

## Shared Filter Notes

The SID filter is a global chip feature, not a per-channel insert effect.

Practical consequences:

- Two voices cannot ask for different filter cutoff values on the same tick without conflict.
- Two voices cannot ask for different filter modes on the same tick without conflict.
- A filter sweep affects every voice currently routed through the filter.

For BeatBax authoring, filter conflicts should be treated as explicit diagnostics rather than silently merged.

## 6581 vs 8580

The two major SID models are audibly different.

Important high-level differences for BeatBax targeting:

- 6581 is associated with rougher, less linear filter behavior.
- 8580 is associated with cleaner, more stable filter response.
- Combined-waveform expectations and filter-sweep tone differ enough that model selection changes authored intent.

BeatBax should therefore require an explicit `chipModel` when targeting SID.

## Region Notes

PAL and NTSC C64 systems differ in timing and clocking. For BeatBax, this means:

- pitch/control timing must be tied to the chosen region profile
- preview and export preparation must use the same profile
- tests should snapshot at least one PAL target and one NTSC target where behavior differs

## BeatBax Targeting Notes

For the SID plugin:

- keep profile selection explicit: `chip = sid`, `chipModel = 6581|8580`, `chipRegion = pal|ntsc`
- derive preview and future export from the same register-log pipeline
- prefer deterministic, documented approximations over unstable analog folklore
- surface filter and sync/ring conflicts as diagnostics