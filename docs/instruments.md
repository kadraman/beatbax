# Instruments Reference

## Wave Channel Volume 🔊

The Game Boy wave channel has a global volume control separate from the wavetable data. BeatBax supports specifying this per-wave instrument using `volume=` (or `vol=` with a percent suffix).

Valid values:

- `volume=0` or `vol=0%` — Mute (0%)
- `volume=25` or `vol=25%` — Quiet (25%)
- `volume=50` or `vol=50%` — Medium (50%)
- `volume=100` or `vol=100%` — Loud (100%) — **default**

Examples:

```
inst bass type=wave wave=[0,4,8,12,15,12,8,4,0,4,8,12,15,12,8,4] volume=100
inst pad  type=wave wave=[8,11,13,14,15,14,13,11,8,4,2,1,0,1,2,4] vol=50%
```

Best practices:
- Use `volume=100` for leads and bass to sit well with pulse channels.
- Use `volume=50` for background pads or textures.
- Avoid `volume=25` unless intentionally very quiet.
- `volume=0` is useful for temporarily muting a wave instrument without removing it.
Note: `volume=` is an output-level selector (stored as 0..3 in UGE). Changes to this value only take effect when the note is retriggered or the instrument is changed — they do not immediately alter already-sounding notes.
---

For other instrument details, consult the respective sections (pulse, noise) in this document or the individual feature pages in `/docs/features/`.
