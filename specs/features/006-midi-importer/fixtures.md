# MIDI conversion fixtures (006)

Inventory only. **Do not commit binary `.mid` files in the specification pass.** When implementing, place CI fixtures under `packages/engine/tests/fixtures/midi/` (or agreed equivalent) with generating commands and checksums recorded here.

Repo currently has **no** `.mid` / `.midi` fixtures. Prefer short, grid-friendly files generated from in-repo `.bax` via `beatbax export midi`.

---

## Source rules

- **Primary:** generate from in-repo `.bax` via `export midi` (deterministic, no license risk, matches chip idioms).
- **Secondary:** short public-domain / CC0 MIDI only where export cannot cover a case. Record URL, license, and checksum before vendoring.
- **Do not** use commercial game ripped MIDIs or copyrighted pop/rock SMFs as committed fixtures.

---

## CI / golden fixture set (F01–F09)

| ID | Proposed filename | Purpose | Source strategy | Must exercise |
|----|-------------------|---------|-----------------|---------------|
| `F01-grid-mono` | `f01-grid-mono.mid` | Happy path, 1–2 melodic tracks, on-grid 16ths | `beatbax export midi songs/features/sequence_demo.bax …` (or a minimal hand-authored song) | Quantize identity, pat/seq emission, verify round-trip structure |
| `F02-gb-kit` | `f02-gb-kit.mid` | Game Boy–shaped arrangement (lead/bass/drums) | Export from `songs/gameboy/tutorial_groove.bax` or `songs/gameboy/grassland_dash.bax` | Default GB instruments, noise drums as named tokens, 4-channel wiring |
| `F03-nes-kit` | `f03-nes-kit.mid` | NES-shaped arrangement | Export from `songs/nes/battle_fanfare.bax` or `songs/nes/puffball_parade.bax` | NES roles (incl. triangle); alignment with NES examples |
| `F04-gm-drums` | `f04-gm-drums.mid` | GM channel-10 percussion map | Synthetic or PD/CC0 MIDI with notes 36/38/42; or export a percussion-heavy GB demo (e.g. `songs/gameboy/instruments/gb_percussion_demo.bax`) | Drum map → `kick` / `snare` / `hihat` |
| `F05-overpoly` | `f05-overpoly.mid` | More simultaneous melodic voices than chip channels | Hand-built or PD MIDI with 5+ overlapping pitched tracks; convert with `--chip gameboy` | Warnings, note drops / top-note flatten, diagnostics counts |
| `F06-inst-switch` | `f06-inst-switch.mid` | Non-overlapping parts that should share one channel via `inst()` | Two melodic streams, same register class, alternating phrases, no overlap | Channel multiplexing without dropping notes |
| `F07-reuse` | `f07-reuse.mid` | Clear repeating bars / AABA-style form | Short looped motif MIDI, or export from a song with repeated pats (e.g. `songs/features/sequence_demo.bax`) | Identical bars → shared `pat`; playlist → `seq` with `*N` |
| `F08-offgrid` | `f08-offgrid.mid` | Syncopation / slight timing drift | Same motif as F01 with notes nudged off 16th grid | nearest/floor/ceil/strict quantize modes and warnings |
| `F09-format0` | `f09-format0.mid` | Type-0 SMF (single track, multi-channel) | Convert a Type-1 fixture to Type-0, or obtain a Type-0 PD file | Format 0 parsing and channel splitting |

### Suggested export commands (fill checksums when generating)

```bash
# Examples — adjust output paths when T012 runs
beatbax export midi songs/features/sequence_demo.bax packages/engine/tests/fixtures/midi/f01-grid-mono.mid
beatbax export midi songs/gameboy/tutorial_groove.bax packages/engine/tests/fixtures/midi/f02-gb-kit.mid
beatbax export midi songs/nes/battle_fanfare.bax packages/engine/tests/fixtures/midi/f03-nes-kit.mid
```

### Acceptance for “identified”

For each row: proposed filename, generating command or external URL+license, and assertion categories (filled above). Checksums and committed binaries are deferred to implementation task T012.

---

## Well-known stretch songs (S01–S10)

Use after F01–F09 pass. Prefer public-domain *compositions* with freely redistributable MIDI *arrangements*. Do not vendor copyrighted game/pop MIDIs in the repo.

| ID | Well-known piece | Why it stretches conversion | Chip stress focus | License posture |
|----|------------------|-----------------------------|-------------------|-----------------|
| `S01-bach-invention` | Bach *Invention No. 1* (or *No. 8*) | Dense 2-voice counterpoint; near-constant polyphony; little natural rest for packing | GB/NES: packing into 2 pulse (+ optional bass empty); warns if arrangement has chordal doublings | PD composition; Mutopia / IMSLP-linked / classical MIDI archive with clear PD/CC notice |
| `S02-bach-wtc-prelude` | Bach *WTC I Prelude in C* (BWV 846) | Broken-chord texture reads as many overlapping MIDI notes; forces chord→mono flatten / arpeggiate policy | 3–4 melodic “voices” from one piano track; pattern reuse of repeating figuration | Same as S01 |
| `S03-fur-elise` | Beethoven *Für Elise* | AABA-like repeats + contrasting B section; ornament messiness in consumer MIDIs | Pattern/seq reuse; ornament quantization; multi-track vs single-track piano | PD composition; pick one vetted PD arrangement |
| `S04-eine-kleine` | Mozart *Eine kleine Nachtmusik* (mvt I excerpt) | Orchestral reduction: many tracks, octave doublings, clear motifs | Over-polyphony warnings; doubling collapse; role heuristics | PD composition; Mutopia/community MIDI |
| `S05-canon-d` | Pachelbel *Canon in D* | Extreme ostinato / layered entries; long identical bars | Seq reuse (`*N`), shared pats, channel saturation as voices enter | PD composition |
| `S06-korobeiniki` | *Korobeiniki* (Tetris-associated folk tune) | Recognizable loop form; often arranged with lead + bass + drums | Full chip kit path; reuse of 4–8 bar loops; optional GM drums | Folk PD melody; **avoid** Nintendo-branded arrangement files |
| `S07-enter-sandman-style` | Typical late-80s/90s GM rock ballad MIDI | Many GM programs, busy ch.10 kit, guitar chords, tempo map | Drum map beyond kick/snare/hat; melodic overpoly; program→inst heuristics | **Do not commit**; local manual stress only, or CC0 “GM rock template” substitute |
| `S08-mario-overworld-style` | Classic 8-bit overworld-style multi-track MIDI (fan game themes) | Chip-like intent but often 6–8 tracks, arps, noise-as-drums | Auto role mapping vs `--chip gameboy`; arp chords; drum track discipline | **Copyrighted themes — manual only, never vendored**; prefer original CC0 chiptune-style MIDI |
| `S09-jazz-swing` | Joplin *The Entertainer* (or similar PD ragtime) | Triplet/swing timing vs straight 16th grid | Off-grid quantize modes; strict-mode failures; warning volume | Joplin PD |
| `S10-multitempo` | SMF with mid-file tempo/time-signature changes | Tempo map → single `bpm` + section comments; bar partitioning across meter changes | Timing normalizer edge cases; diagnostics | Prefer PD classical with explicit tempo events |

**Suggested stretch order:** S06 → S01 → S05 → S09 → S02 → S04 → S03, then optional local-only S07/S08.

### Repo policy

| Set | CI goldens | May document URL + checksum | May commit binary |
|-----|------------|-----------------------------|-------------------|
| F01–F09 | Yes | Yes | Yes (when implementing) |
| S01–S06, S09–S10 | No (manual) | Yes if license-clear | Optional, license-clear only |
| S07–S08 | No | Recipe only | **Never** |

When a clear PD/CC download is chosen for S01–S06 / S09–S10, record below (fill during implementation or manual stretch prep):

| ID | URL | License | SHA-256 | Notes |
|----|-----|---------|---------|-------|
| *(none yet)* | | | | |

---

## Related songs in-repo (export sources)

Useful `.bax` sources for generating F0x MIDIs:

- `songs/features/sequence_demo.bax`
- `songs/gameboy/tutorial_groove.bax`
- `songs/gameboy/grassland_dash.bax`
- `songs/gameboy/instruments/gb_percussion_demo.bax`
- `songs/nes/battle_fanfare.bax`
- `songs/nes/puffball_parade.bax`
