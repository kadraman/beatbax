# Song Metadata Directives

BeatBax supports top-level `song` metadata directives inside `.bax` files to capture human-readable information about a song and to map those fields into export formats (JSON, UGE, WAV metadata where applicable).

Supported directives

- `song name "Title"` — the canonical song title.
- `song artist "Artist Name"` — the performing/composer metadata.
- `song description "..."` — a short description. Supports triple-quoted multiline strings.
- `song tags "tag1, tag2"` — comma- or newline-separated tags.

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