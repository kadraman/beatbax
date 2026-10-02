# 089 parity record

## SC-001: 006 compatibility (done, 2026-10-01)

- 006 goldens F01–F09 and all existing importer tests pass unchanged (`packages/engine/tests/import/midi/`).
- Byte-identity check against the pre-089 engine (`HEAD` at `fac335b`): F01–F09 × `gameboy`/`nes` × 4 configs (none, `f03-nes-kit.import.json`, `f06-inst-switch.import.json`, `family-override.example.json`) × 6 option variants (defaults, `sectionBars: 0`, `quantize: strict`, `grid: 1/8`, `maxOverlapTicks: 2`, `maxBars: 2`) = 432 conversions, comparing emitted source and summary (excluding the new optional `mappingStats`).
  - Before FR-041 (2026-09-30): **0 differences**. All used `ticksPerBeat` 4, where FR-040 does not apply.
  - After FR-041 (2026-10-01): **44 differences**, all in drum (`drums_*`) or DMC (`dmc_*`) patterns where a drum note quantized to more than one step was written as `name:N` and is now `name .:N-1` (e.g. `kick:2 snare:2` → `kick . snare .`, `hihat:8` → `hihat .:7`). Where drum bars now become identical, pattern count and order change with them; melodic content is unchanged. 36 of the 44 are `grid: 1/8` variants, the other 8 are F05 with the `f03-nes-kit` drum map.
- The intended differences are FR-040 (written bpm for `ticksPerBeat` ≠ 4; golden F13 and `midi-arrangement-timing.test.ts`) and FR-041 (one-step drum hits; `midi-arrangement-lanes.test.ts`, "drum hits are one step long").

## SC-002 to SC-004: `songs/covers` parity (done, 2026-10-01, operator-local)

Run on an operator's local copy of the covers repository (`songs/covers`, excluded from this repository since `18031e4`) at covers commit `c11319a`. Not reproducible in CI.

Procedure:

1. `songs/covers/tools/recipe-to-import.mjs` translated each `midi/<song>.split.json` recipe into `midi/<song>.import.json`: `packing: "lanes"`, `unmappedTracks: "drop"`, one mapping per split segment in lane order (`fromBar`/`toBar`, `mono`, `transpose`/`fold`, instrument), one `noise` mapping per drum source (`include`/`exclude`/bar range; split `remap` entries folded into the mapping's `drumMap`), `bpm` or `tempo: "longest"`, `startBar`/`endBar`, `nudge`, `ticksPerBeat`/`patternTicks`, and the recipe's `importer` options.
2. A one-off script (`tools/parity-089.mjs`, removed with the split tooling) converted each original `.mid` directly for `gameboy` and `nes` (26 outputs) and, as the reference, re-imported each `.split.mid` with its split-era config on the same engine. It compared the resolved per-channel step timelines (note, instrument, rest, sustain per step; pattern names ignored), the written `bpm`, instrument definitions, warnings, `beatbax verify`, and duplicate tracks from `beatbax import midi --inspect` against `split-midi.mjs --inspect`.

Results: every song matches, with one explained one-step difference (X-Files) and two explained differences against hand-edited committed files.

| Song | SC-002 notes per channel (direct vs split pipeline) | vs committed `.bax` | SC-003 watched warnings / verify | SC-004 duplicates | Other warnings |
|------|------------------------------------------------------|---------------------|-----------------------------------|-------------------|----------------|
| aha-take_on_me | same (GB, NES) | same | none / ok | same | `lane_overlap` |
| airwolf | same (GB, NES) | same | none / ok | same | `lane_overlap` |
| berlin-take_my_breath_away | same (GB, NES) | same | none / ok | same | `lane_overlap` |
| depeche_mode-enjoy_the_silence | same (GB, NES) | same | none / ok | same | `lane_overlap` |
| eurythmics-sweet_dreams | same (GB, NES) | same | none / ok | same | `lane_overlap` |
| inspector_gadget | same (GB, NES) | same | none / ok | same | `lane_overlap` |
| knightrider | same (GB, NES) | same | none / ok | same | `time_signature_ignored`, `lane_overlap` |
| madness-our_house | same (GB, NES) | same | none / ok | same | `tempo_map_ignored`, `lane_overlap` |
| miami_vice | same (GB, NES) | same | none / ok | same | `tempo_map_ignored`, `lane_overlap` |
| new_order-blue_monday | same (GB, NES) | same | none / ok | same | `lane_overlap` |
| streethawk | same (GB, NES) | NES same; GB differs (hand-edited, see below) | none / ok | same | `tempo_map_ignored`, `lane_overlap` |
| toto-africa | same (GB, NES) | NES same; GB differs (hand-edited, see below) | none / ok | same | `lane_overlap` |
| x_files_trance_mix | 1 step differs on ch1 (GB, NES; see below) | same 1 step | none / ok | same | `lane_overlap` |

Instrument definitions match in all 26 outputs.

### Differences

- **X-Files (`gameboy`, `nes`), ch1, output bar 135 step 16 (source bar 136): rest → sustain.** Track 4 has three `A5` notes starting on the same tick, quantized to 3, 4 and 4 steps. 089 `mono` reduction keeps the louder one under the 006 order (velocity, then pitch, then source order), which is 4 steps long; `split-midi.mjs` kept the first in file order, which is 3 steps. Same pitch and onset; the note is held one step longer. No change needed.
- **Street Hawk and Toto, `gameboy`, vs committed `.bax`.** Both files were edited by hand after generation (covers commit `c11319a`, "streethawk updates"). The versions generated in covers commit `9923762` are identical to the direct import.
- **Airwolf `bpm`.** Direct import writes `bpm 101`, matching the committed file. Re-importing the reference `.split.mid` gives 76, because that file was already tempo-scaled by `split-midi.mjs` for `ticksPerBeat: 3` and FR-040 scales it again. This affects only the retired split pipeline, not direct import.
- **`lane_overlap` in every song.** These are the overlapping notes `split-midi.mjs` dropped silently when it built each lane; 089 now counts and reports them.

### Engine fix found by this run (FR-041)

The first run matched only 4 of 13 songs and raised `mono_conflict` in most outputs. Drum notes longer than one step were written as `name:N`, which the resolver plays as one step, so the drum channel drifted out of sync. `split-midi.mjs` had hidden this by writing one-step drum notes into the `.split.mid`. Fixed in `packPercussion` (spec FR-041). The results above are after the fix.

## Retiring `split-midi.mjs` (T902)

SC-002 to SC-004 hold, so direct import with the translated `.import.json` configs reproduces every split-based cover. On 2026-10-01 the operator's covers working copy dropped `tools/split-midi.mjs`, `tools/annotate-bax.mjs` (superseded by `--annotate`), the `midi/*.split.mid` files and the split-era `midi/*.json` configs. The `.split.json` recipes are kept for now as the source of `tools/recipe-to-import.mjs` and the hand-written header notes. The covers repository is separate, so committing that clean-up happens there.
