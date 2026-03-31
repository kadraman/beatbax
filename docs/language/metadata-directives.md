# Song Metadata and Global Directives

BeatBax supports top-level directives inside `.bax` files to:
1. Configure global playback settings (`chip`, `bpm`, `volume`, `time`)
2. Capture human-readable song metadata (`song name`, `song artist`, etc.)

## Global Playback Directives

- **`chip <name>`** — Selects the audio backend (currently only `gameboy` is supported)
- **`bpm <number>`** — Sets the tempo in beats per minute (default: `120`)
- **`volume <float>`** — Sets master output volume, range `0.0` to `1.0` (default: `1.0`)
  - See [volume-directive.md](volume-directive.md) for details
- **`time <number>`** or **`stepsPerBar <number>`** — Sets beats per bar (default: `4`)
- **`ticksPerStep <number>`** — Sets tick resolution per step (default: `16`)

### Example

```
chip gameboy
bpm 140
volume 0.5
time 4

inst lead type=pulse1 duty=75 env=15,up
pat melody = C5 E5 G5 C6
seq main = melody
channel 1 => inst lead seq main
play
```

## Song Metadata Directives

- **`song name "Title"`** — the canonical song title.
- **`song artist "Artist Name"`** — the performing/composer metadata.
- **`song description "..."`** — a short description. Supports triple-quoted multiline strings.
- **`song tags "tag1, tag2"`** — comma- or newline-separated tags.

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

If you want additional fields (copyright, year, license), I can add them and map them to the relevant export formats.