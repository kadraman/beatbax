# Demo songs

This folder contains small example `.bax` scripts used by the demo UI.

Channel mapping note
- Channel 1 (Pulse1): lead melody — mapped to `seq lead` in the example
- Channel 2 (Pulse2): bass / harmony — mapped to `seq bass` (often transposed)
- Channel 3 (Wave): wavetable arpeggios / pads — mapped to `seq wave`
- Channel 4 (Noise): percussion / hits — mapped to `seq drums`

Why separate sequences?
- Splitting parts into per-instrument sequences makes it easy to loop, mute,
  or swap parts independently in the demo UI.
- Use sequence-level transforms (e.g. `:oct(-1)` or `:inst(bass)`) to alter
  an entire part without changing pattern internals.

Examples
- `seq lead = A A_alt E A` — main melody
- `seq drums = P P2 P P` — drum parts using named hits and `hit()`/`inst()` shorthands

GM program numbers
- Instruments may include an optional `gm=<0-127>` attribute to select a General MIDI program
  when exporting to MIDI. Example: `inst leadA type=pulse1 duty=60 env=gb:12,down,1 gm=81`.

See `sample.bax` for a working example that maps these sequences to the
four Game Boy-like channels used by the demo player.
