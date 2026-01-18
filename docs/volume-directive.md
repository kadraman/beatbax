# Master Volume Control

BeatBax provides a `volume` directive to control the master output level for all channels, preventing clipping and normalizing volume across both CLI and browser playback contexts.

## Syntax

```
volume <value>
```

Where `<value>` is a floating-point number in the range `0.0` to `1.0`:
- `0.0`: Silent (muted)
- `0.25`: Conservative (prevents clipping in densest possible mixes)
- `0.5`: Half volume
- `1.0`: Maximum volume (default, matches hUGETracker behavior)

Values outside the range `0.0–1.0` are automatically clamped.

## Default Behavior

If no `volume` directive is specified, BeatBax uses a **default of `1.0`** (no attenuation). This matches hUGETracker's behavior and provides maximum loudness.

**Note**: With all 4 channels playing at maximum envelope volume simultaneously, output may clip in digital playback systems. If you experience clipping/distortion, reduce `volume` to `0.25`-`0.5` or use WAV export normalization.

## Example

```
chip gameboy
bpm 140
volume 0.5  # Reduce to 50% to prevent clipping in dense mixes

inst lead  type=pulse1 duty=75 env=15,up
inst bass  type=pulse2 duty=25 env=12,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst drums type=noise  env=10,down

pat melody = C5:4 E5:4 G5:4 C6:4
pat bassline = C3:8 . G2:8 .

seq main = melody bassline

channel 1 => inst lead  seq main
channel 2 => inst bass  seq main
channel 3 => inst wave1 seq main
channel 4 => inst drums seq main

play
```

## Implementation Notes

### WebAudio Playback

During WebAudio playback (browser or Node.js), BeatBax creates a **master gain node** that connects all channel outputs to the audio context's destination. The master gain is set to the value specified by the `volume` directive (or `0.25` by default).

All channel-level gain nodes (envelopes, effects) are applied first, then the master gain is applied globally.

### PCM Rendering (WAV Export)

When rendering to PCM for WAV export or CLI playback, BeatBax applies the master volume multiplier to all samples **before** normalization:

```
finalSample = channelMixedSample * masterVolume
```

This ensures that WAV files and CLI playback match the volume of browser playback.

### Normalization

The `volume` directive is applied **before** normalization:

- **With `normalize: false` (default)**: Master volume scales the output, but may still be clipped if the result exceeds ±1.0.
- **With `normalize: true`**: After applying master volume, the renderer finds the peak absolute value and scales the entire buffer to maximize dynamic range without clipping.

The `volume` directive gives you control over the **relative loudness** of your song before any normalization is applied.

## Why 1.0 Default?

BeatBax uses **`1.0` (no attenuation)** by default to match hUGETracker's behavior and provide maximum loudness. Game Boy hardware and most emulators handle the additive mixing of 4 channels without explicit volume reduction.

**Understanding Clipping Risk**:

If all 4 channels play simultaneously at maximum envelope volume (15/15):

```
4 channels × 1.0 amplitude = 4.0 peak amplitude → potential clipping
```

However, this worst-case scenario rarely occurs in real music. Most songs use varied envelopes, rests, and dynamics that prevent sustained peaks across all channels.

### Choosing the Right Volume

The `1.0` default works well for most songs, but you should adjust if you experience clipping:

| Mix Density | Recommended Volume | Use Case |
|-------------|-------------------|----------|
| **Sparse** (1-2 channels) | `1.0` (default) | Minimal, atmospheric pieces, solo demos |
| **Moderate** (2-3 channels average) | `0.8` to `1.0` (default) | Typical chiptune arrangements |
| **Dense** (3-4 channels, high envelopes) | `0.4` to `0.6` | Most multi-channel songs |
| **Extremely dense** (4 channels, max volumes) | `0.25` to `0.35` | Full drum + bass + lead + harmony at high envelopes |

**Recommendation**: Start with the default `1.0`. If you hear clipping/distortion, gradually reduce `volume` until it sounds clean. Most songs work well between `0.5` and `1.0`.

### Alternative: Use Normalization for WAV Export

If your song clips at `volume 1.0`, you can:
1. Keep `volume 1.0` for playback (matches hUGETracker)
2. Use `normalize: true` when exporting to WAV (CLI: `--normalize`)
3. Let the renderer automatically scale to prevent clipping in the exported file

This preserves maximum loudness in exports while allowing you to hear potential clipping issues during development.

## Comparison with Instrument Volume

| Feature | Scope | Range | Notes |
|---------|-------|-------|-------|
| **`volume` directive** | Global (all channels) | `0.0` to `1.0` | Applied after all per-channel processing |
| **Wave channel `volume` property** | Single channel (Wave only) | `0`, `25`, `50`, `100` (GB hardware levels) | GB-specific attenuation |
| **Envelope `level`** | Per-note | `0` to `15` (GB hardware) | Mapped to `0.0` to `1.0` in WebAudio |

The `volume` directive is the **master control** for overall loudness, while instrument properties control relative levels within the mix.

## See Also

- [Metadata Directives](metadata-directives.md) - Other top-level directives (`bpm`, `chip`, `time`)
- [Instruments](instruments.md) - Instrument-level volume controls (Wave channel)
- [WAV Export Guide](wav-export-guide.md) - Normalization options for WAV export
