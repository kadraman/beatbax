---
"@beatbax/engine": minor
---

Readable names in `beatbax import midi` output (feature 090, [#214](https://github.com/kadraman/beatbax/issues/214)).

**Behaviour change:** generated names follow the `_inst` / `_pat` / `_seq` convention. Patterns are numbered in the order they first play (`lead_01_pat`) instead of named by content hash, all-rest bars share one `rest_x16_pat` (length in steps), sequences are `lead_seq` or `lead_s01_seq`, and generated melodic instruments are `lead_p1_inst`, `bass_inst`, …. Drum instruments (`kick`, `snare`, …) and instrument names from the config are unchanged. The music is identical; only names and pattern order differ.
