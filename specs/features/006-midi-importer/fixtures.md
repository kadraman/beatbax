# MIDI conversion fixtures (006)

CI fixtures live under `packages/engine/tests/fixtures/midi/`. Regenerators:

```bash
# F01–F03 from in-repo songs
beatbax export midi songs/gameboy/grassland_dash.bax packages/engine/tests/fixtures/midi/f01-grid-mono.mid
beatbax export midi songs/gameboy/tutorial_groove.bax packages/engine/tests/fixtures/midi/f02-gb-kit.mid
beatbax export midi songs/nes/battle_fanfare.bax packages/engine/tests/fixtures/midi/f03-nes-kit.mid

# F04–F09 synthetic
node packages/engine/scripts/generate-midi-fixtures.mjs
```

---

## Source rules

- **Primary:** generate from in-repo `.bax` via `export midi` (deterministic, no license risk, matches chip idioms).
- **Secondary:** short public-domain / CC0 MIDI only where export cannot cover a case. Record URL, license, and checksum before vendoring.
- **Do not** use commercial game ripped MIDIs or copyrighted pop/rock SMFs as committed fixtures.

---

## CI / golden fixture set (F01–F09)

| ID | Filename | Purpose | Source | SHA-256 |
|----|----------|---------|--------|---------|
| `F01-grid-mono` | `f01-grid-mono.mid` | Happy path melodic | `export midi songs/gameboy/grassland_dash.bax` | `f7ac4ef73635670bf53748ae9c3a4d2732c8ea1ebbc765aa227033553d4d8e92` |
| `F02-gb-kit` | `f02-gb-kit.mid` | GB lead/bass/drums | `export midi songs/gameboy/tutorial_groove.bax` | `a5dcae11748311121e7bbdf5cee508eeaadcd6355869e6d9de3229a894d2564f` |
| `F03-nes-kit` | `f03-nes-kit.mid` | NES roles | `export midi songs/nes/battle_fanfare.bax` | `be60e87b76fc0251378ec150b6e003ba83f041b107877d902858539a77d6fd9f` |
| `F04-gm-drums` | `f04-gm-drums.mid` | GM ch.10 → kick/snare/hihat | `generate-midi-fixtures.mjs` | `ced817799db601ec4e6a9318ee3930599fa88e0bda3bb18426cd165d347a885c` |
| `F05-overpoly` | `f05-overpoly.mid` | Over-polyphony warnings | `generate-midi-fixtures.mjs` | `f2317c8394e92e0c69b0e01fd3c3161e3615b3c88e9301aa6718f67e0e5a1c55` |
| `F06-inst-switch` | `f06-inst-switch.mid` (+ `f06-inst-switch.import.json`) | `inst()` multiplex | `generate-midi-fixtures.mjs` | `ae48311752185bc9d7d00b94d30bb3f435fdbc40eb706b4ee9ffa7bf8c297349` |
| `F07-reuse` | `f07-reuse.mid` | Shared `pat` + `seq *N` | `generate-midi-fixtures.mjs` | `1afb3d8693f3431d5300978c9ad44a00544d1d0b75a88eb33b5d7847bb6a9ce0` |
| `F08-offgrid` | `f08-offgrid.mid` | Quantize modes / strict fail | `generate-midi-fixtures.mjs` | `eaf2c1e92385e3444e0cb93437687ee9120c942a1c86acbbdb2028105a1bdfe2` |
| `F09-format0` | `f09-format0.mid` | Type-0 SMF | `generate-midi-fixtures.mjs` | `5f33d26072fdb9fccf1ab39d9b3e70f803b0f3710af9efda93d4a8f638cd5fcf` |

Golden tests: `packages/engine/tests/import/midi/midi-golden.test.ts`.

---

## Well-known stretch songs (S01–S10)

Use after F01–F09 pass. Prefer public-domain *compositions* with freely redistributable MIDI *arrangements*. Do not vendor copyrighted game/pop MIDIs in the repo.

| ID | Well-known piece | Why it stretches conversion | Chip stress focus | License posture |
|----|------------------|-----------------------------|-------------------|-----------------|
| `S01-bach-invention` | Bach *Invention No. 1* (or *No. 8*) | Dense 2-voice counterpoint | GB/NES packing | PD composition; Mutopia / IMSLP-linked |
| `S02-bach-wtc-prelude` | Bach *WTC I Prelude in C* (BWV 846) | Broken-chord polyphony | Chord→mono flatten | Same as S01 |
| `S03-fur-elise` | Beethoven *Für Elise* | AABA repeats + ornaments | Pattern/seq reuse | PD composition |
| `S04-eine-kleine` | Mozart *Eine kleine Nachtmusik* (mvt I excerpt) | Orchestral reduction | Over-polyphony | PD composition |
| `S05-canon-d` | Pachelbel *Canon in D* | Ostinato / layered entries | Seq reuse (`*N`) | PD composition |
| `S06-korobeiniki` | *Korobeiniki* (folk) | Loop form + drums | Full chip kit | Folk PD; avoid Nintendo-branded files |
| `S07-enter-sandman-style` | GM rock ballad MIDI | Busy ch.10 + chords | Drum map / overpoly | **Do not commit**; local only |
| `S08-mario-overworld-style` | Classic 8-bit overworld-style MIDI | 6–8 tracks | Auto role mapping | **Never vendored** |
| `S09-jazz-swing` | Joplin *The Entertainer* | Swing vs 16th grid | Off-grid quantize | Joplin PD |
| `S10-multitempo` | SMF with tempo/time-sig changes | Tempo map edge cases | Timing normalizer | Prefer PD classical |

**Suggested stretch order:** S06 → S01 → S05 → S09 → S02 → S04 → S03, then optional local-only S07/S08.

### Repo policy

| Set | CI goldens | May document URL + checksum | May commit binary |
|-----|------------|-----------------------------|-------------------|
| F01–F09 | Yes | Yes | Yes |
| S01–S06, S09–S10 | No (manual) | Yes if license-clear | Optional, license-clear only |
| S07–S08 | No | Recipe only | **Never** |

| ID | URL | License | SHA-256 | Notes |
|----|-----|---------|---------|-------|
| *(none yet)* | | | | |

### Manual stretch notes (T016)

Run locally (do not commit copyrighted MIDIs):

```bash
beatbax import midi path/to/S06.mid /tmp/s06.bax --chip gameboy
beatbax verify /tmp/s06.bax
```

Record qualitative results (reuse quality, warning volume, packing) in PR notes when exercising the stretch set.
