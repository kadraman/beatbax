# Song Metadata and Global Directives

> **Canonical timing model (source of truth)**  
> Song tempo is set with `**bpm`**. Bar/beat grouping in the editor and resolver uses `**stepsPerBar**` (default `4`).  
> The engine uses a **fixed internal tick resolution**; it is not configurable per song.  
> `**time`** is a deprecated alias for `stepsPerBar` (parser warning). `**ticksPerStep**` is deprecated and **ignored** (parser warning).  
> Feature specs under `docs/features/complete/` link here for timing behavior. Peggy grammar excerpts may still list `time` / `ticksPerStep` as parseable tokens (backward compatibility); they are **not** active song settings.

BeatBax supports top-level directives inside `.bax` files to:

1. Configure global playback settings (`chip`, `bpm`, `volume`, `stepsPerBar`)
2. Capture human-readable song metadata (`song name`, `song artist`, etc.)
3. Configure optional scale-awareness validation (`scale` + channel `lock`)

## Global Playback Directives

- `**chip <name>`** — Selects the audio backend. Supported chips: `gameboy` or `gb`, `nes`, `sms`, `gg` or `gamegear`.
  - `**chip sms ntsc**` / `**chip sms pal**` — optional region qualifier for the SN76489 SMS backend. Selects the hardware clock frequency used for tone period calculations. `ntsc` (3,579,545 Hz, default) matches North American and Japanese hardware; `pal` (3,546,895 Hz) matches European hardware. Omitting the qualifier defaults to `ntsc`.
  - `**chip nes ntsc**` / `**chip nes pal**` — optional region qualifier for the NES backend. Selects the CPU clock frequency used for period and DMC rate calculations. `ntsc` (1,789,773 Hz, default) matches North American and Japanese hardware; `pal` (1,662,607 Hz, ~7.1% lower) matches European hardware. Omitting the qualifier defaults to `ntsc`.
  - The region qualifier is only valid for `chip sms` and `chip nes`; using it with any other chip is a parser error.
- `**bpm <number>**` — Sets the tempo in beats per minute (default: `120`)
- `**volume <float>**` — Sets master output volume, range `0.0` to `1.0` (default: `1.0`)
  - See [volume-directive.md](volume-directive.md) for details
- `**stepsPerBar <number>**` — Sets steps per bar for bar/beat display and bar numbering (default: `4`). This is the canonical directive for time-signature-style grouping in the editor and resolver.
- `**time <number>**` — *(deprecated)* Alias for `stepsPerBar`. Still parsed for backward compatibility; emits a parser warning. Prefer `stepsPerBar`.
- `**ticksPerStep <number>*`* — *(deprecated, no effect)* Parsed for backward compatibility only. The value is ignored; the engine uses a fixed internal tick resolution. Emits a parser warning.
- `**scale <root> <mode> [warn|error|off]**` — Declares a song-level musical scale used by parser diagnostics and MIDI step-entry scale snap.
  - Examples: `scale C major`, `scale A minor error`, `scale F# dorian off`.
  - `warn` (default): out-of-lock notes produce warnings.
  - `error`: out-of-lock notes produce errors.
  - `off`: keeps scale metadata for UI/MIDI features but disables diagnostics.

### Channel locks

Channel locks restrict notes on a per-channel basis when `scale` is declared:

- `lock=scale` — any note in the declared scale
- `lock=root+fifth` — degree 1 + 5 only
- `lock=chord` — degree 1 + 3 + 5
- `lock=chord7` — degree 1 + 3 + 5 + 7
- `lock=octaves` — root note only (all octaves)

`lock` is optional per channel. If a lock is used without `scale`, the parser emits an error.

### Example

```
chip gameboy
bpm 140
volume 0.5
stepsPerBar 4
scale C major warn

inst lead type=pulse1 duty=75 env=15,up
pat melody = C5 E5 G5 C6
seq main = melody
channel 1 => inst lead seq main lock=scale
play
```

## Song Metadata Directives

- `**song name "Title"**` — the canonical song title.
- `**song artist "Artist Name"**` — the performing/composer metadata.
- `**song description "..."**` — a short description. Supports triple-quoted multiline strings.
- `**song tags "tag1, tag2"**` — comma- or newline-separated tags.

Multiline strings

Use triple quotes for values that span lines. Example:

```
song description """This song demonstrates
multiline metadata values and preserves
newlines inside the description."""
```

Tags may be provided as a single quoted string with commas, or inside a triple-quoted string with newlines:

```
song tags "demo,metadata,example"

# or
song tags """demo
metadata
example"""
```

How these fields are mapped

- JSON export: all `song` metadata is included under the `song.metadata` field in the exported ISM JSON.
- UGE export: `song name` → UGE title, `song artist` → UGE author, `song description` → UGE comment (if available). Values are truncated to UGE header field lengths when required.
- WAV export: metadata may be written to WAV INFO or ID3 tags by the WAV exporter when supported.

Example

See the example file at `songs/metadata_example.bax` for a working `.bax` demonstrating single-line and triple-quoted metadata values.

Notes

- Metadata parsing happens at parse/expansion time and is preserved into the resolved `SongModel.metadata` used by the player and exporters.
- Multiline descriptions preserve newline characters; tags are normalized and trimmed.
