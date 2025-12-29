# WAV Export Usage Guide

## Overview
BeatBax supports exporting songs to WAV audio files using a direct PCM renderer that generates sample-accurate Game Boy audio without browser dependencies. WAV export is available through the CLI and can be used for archival, distribution, or integration with DAWs and audio editing tools.

## Quick Start

### 1. Write a BeatBax Song

Create a `.bax` file with your song:

```
chip gameboy
bpm 128

inst lead type=pulse1 duty=50 env=gb:12,down,1
inst bass type=pulse2 duty=25 env=gb:10,down,1
inst wave1 type=wave wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst snare type=noise env=gb:12,down,1

pat melody = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat arp = C4 E4 G4 C5
pat drums = . . snare .

channel 1 => inst lead pat melody
channel 2 => inst bass pat bassline
channel 3 => inst wave1 pat arp
channel 4 => inst snare pat drums
```

### 2. Export to WAV

Using the CLI:

```bash
# Basic export (auto-calculated duration)
npm run cli -- export wav mysong.bax mysong.wav

# With explicit duration
npm run cli -- export wav mysong.bax mysong.wav --duration 30

# Export individual channels for debugging
npm run cli -- export wav mysong.bax channel1.wav --channels 1
```

Output:
```
✓ Exported WAV: mysong.wav (793800 samples, 44100Hz, 16-bit, 2ch)
```

### 3. Use the WAV File

The exported WAV can be used in:
- **DAWs**: Import into FL Studio, Ableton, Logic Pro, etc.
- **Audio Editors**: Edit in Audacity, Audition, etc.
- **Game Engines**: Use as background music in Unity, Godot, etc.
- **Distribution**: Share on SoundCloud, Bandcamp, YouTube, etc.

## Format Details

### Audio Specifications
- **Format**: RIFF WAVE (PCM)
- **Sample Rate**: 44100 Hz (default, configurable via `-r`)
- **Bit Depth**: 16, 24, or 32-bit signed integer (default: 16, configurable via `-b`)
- **Channels**: 2 (stereo)
- **Byte Order**: Little-endian
- **Encoding**: Linear PCM (no compression)

### File Structure (Example: 16-bit)
```
RIFF Header (12 bytes):
  - "RIFF" chunk ID
  - File size - 8
  - "WAVE" format

fmt Chunk (24 bytes):
  - "fmt " chunk ID
  - Chunk size: 16
  - Audio format: 1 (PCM)
  - Channels: 2 (stereo)
  - Sample rate: 44100 Hz
  - Byte rate: 176400 (sample_rate × channels × 2)
  - Block align: 4 (channels × 2)
  - Bits per sample: 16

data Chunk (variable):
  - "data" chunk ID
  - Data size in bytes
  - Interleaved stereo PCM samples
```

For 24-bit and 32-bit exports, the `Byte rate`, `Block align`, and `Bits per sample` fields are adjusted accordingly. 24-bit samples are stored as 3 bytes per sample, and 32-bit samples as 4 bytes per sample.

### Channel Mapping
All four Game Boy channels are mixed to stereo:
- Channel 1 (Pulse 1) → Stereo output
- Channel 2 (Pulse 2) → Stereo output
- Channel 3 (Wave) → Stereo output
- Channel 4 (Noise) → Stereo output

Each channel contributes equally to left and right channels. Pan control is not currently implemented but planned for future versions.

## Advanced Usage

### Duration Control

**Auto-calculated (recommended):**
```bash
npm run cli -- export wav mysong.bax output.wav
```
Duration is calculated from the longest channel's event stream with a 1-second buffer.

**Explicit duration:**
```bash
npm run cli -- export wav mysong.bax output.wav --duration 45
```
Useful for:
- Ensuring consistent duration across multiple exports
- Adding extra silence at the end
- Truncating long fade-outs

### Per-Channel Export

Export individual Game Boy channels for debugging, mixing, or analysis:

```bash
# Channel 1: Pulse 1 (lead melody)
npm run cli -- export wav mysong.bax ch1-pulse1.wav --channels 1

# Channel 2: Pulse 2 (bass/harmony)
npm run cli -- export wav mysong.bax ch2-pulse2.wav --channels 2

# Channel 3: Wave (wavetable)
npm run cli -- export wav mysong.bax ch3-wave.wav --channels 3

# Channel 4: Noise (drums/percussion)
npm run cli -- export wav mysong.bax ch4-noise.wav --channels 4
```

Use cases:
- **Debugging**: Isolate which channel has timing issues
- **Mixing**: Import individual channels into DAW for custom mixing
- **Analysis**: Examine waveforms and envelopes per channel
- **Education**: Demonstrate how each channel contributes to the mix

### Custom Sample Rate

Specify a different sample rate (default is 44100 Hz):

```bash
npm run cli -- play mysong.bax --render-to output.wav --sample-rate 48000
```

Common sample rates:
- **44100 Hz**: CD quality (default)
- **48000 Hz**: Professional audio, DAW standard
- **22050 Hz**: Half CD quality (smaller files)
- **96000 Hz**: High-resolution audio

### Multiple Export Formats

Export to all formats in a single workflow:

```bash
npm run cli -- export json mysong.bax mysong.json
npm run cli -- export midi mysong.bax mysong.mid
npm run cli -- export uge mysong.bax mysong.uge
npm run cli -- export wav mysong.bax mysong.wav
```

### Programmatic Export

Use the TypeScript API for batch processing or integration:

```typescript
import { exportWAVFromSong } from '@beatbax/engine/export';
import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song/resolver';
import { readFileSync } from 'fs';

// Parse and resolve song
const source = readFileSync('mysong.bax', 'utf-8');
const ast = parse(source);
const song = resolveSong(ast);

// Render and export to WAV file
await exportWAVFromSong(song, 'output.wav', {
  sampleRate: 44100,
  duration: undefined, // auto-calculate
  renderChannels: [1, 2, 3, 4] // all channels
});

console.log('✓ Exported WAV file');
```

## PCM Renderer Implementation

The WAV export uses a custom PCM renderer (`packages/engine/src/audio/pcmRenderer.ts`) that directly generates audio samples without WebAudio dependencies.

### Architecture

**Rendering Pipeline:**
1. Parse song → AST
2. Resolve AST → Intermediate Song Model (ISM)
3. Render ISM → Float32Array samples
4. Convert to 16-bit PCM → WAV buffer
5. Write to file

**Channel Rendering:**

Each Game Boy channel is rendered independently and mixed:

- **Pulse Channels (1 & 2):**
  - Generate square wave with duty cycle (12.5%, 25%, 50%, 75%)
  - Apply Game Boy envelope (initial volume, direction, period)
  - Frequency: Note MIDI number → Game Boy period register → Hz
  - Amplitude: `square_wave × envelope × 0.6`

- **Wave Channel (3):**
  - 16×4-bit wavetable (0-15 values)
  - Phase-accurate sample lookup with interpolation
  - Normalize to `[-1.0, 1.0]` range
  - Amplitude: `wavetable_sample × 0.6`

- **Noise Channel (4):**
  - Linear Feedback Shift Register (LFSR) based noise
  - Configurable: width (7/15-bit), divisor, shift frequency
  - LFSR frequency: `4194304 Hz / (divisor × 2^(shift+1))`
  - Output: Random {-1.0, 1.0} scaled by envelope

**Envelope Calculation:**
```
Game Boy envelope:
  - Initial volume: 0-15
  - Direction: up or down
  - Period: 1-7 (steps per 1/64 second)

Volume = clamp(initial ± steps, 0, 15) / 15.0
Step time = period × (65536 / 4194304) ≈ period × 0.015625s
```

**Normalization:**
After mixing all channels, the output is normalized to prevent clipping:
```
max_amplitude = max(|sample|) across all samples
if max_amplitude > 0.95:
  scale_factor = 0.95 / max_amplitude
  samples *= scale_factor
```

### Quality Comparison

**PCM Renderer vs WebAudio:**
- **Timing**: Both are sample-accurate and deterministic
- **Quality**: PCM output closely matches WebAudio (>95% similarity)
- **Performance**: PCM is faster for offline rendering (no real-time constraints)
- **Portability**: PCM works in pure Node.js without browser/native dependencies

Minor differences exist due to:
- WebAudio uses `PeriodicWave` and `OscillatorNode` (hardware-accelerated)
- PCM uses direct sample generation (software-based)
- Envelope timing may differ by <1 sample due to rounding

For most use cases, the differences are imperceptible. Use browser export (`--browser`) if you need bit-exact WebAudio output for comparison.

## Validation

### Verify WAV File Properties

**Using ffprobe:**
```bash
ffprobe -hide_banner mysong.wav
```

Expected output:
```
Duration: 00:00:09.00, bitrate: 1411 kb/s
Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 1411 kb/s
```

**Using MediaInfo:**
```
Format: Wave
File size: 1.48 MiB
Duration: 9 s 0 ms
Bit rate: 1 411 kb/s
Sampling rate: 44.1 kHz
Bit depth: 16 bits
Channels: 2 channels
```

### Compare Exports

Compare CLI PCM export with browser WebAudio export:

```bash
# Export from CLI
npm run cli -- play mysong.bax --render-to cli-export.wav

# Export from browser (run web UI, click "Export WAV" button)
# Save as browser-export.wav

# Compare file sizes (should be identical)
ls -lh *-export.wav

# Compare audio quality (visual/auditory inspection)
# Import both into Audacity and compare waveforms
```

## Troubleshooting

### File Won't Play
**Symptoms:** WAV file won't open in media player
**Solutions:**
- Verify file size: should be >100KB for typical songs
- Check header: first 4 bytes should be "RIFF" (52 49 46 46 hex)
- Verify format with `ffprobe` or MediaInfo
- Try re-exporting with default settings

### Duration Too Short/Long
**Symptoms:** Song cuts off early or has too much silence
**Solutions:**
```bash
# Let BeatBax auto-calculate (recommended)
npm run cli -- play mysong.bax --render-to output.wav

# Set explicit duration
npm run cli -- play mysong.bax --render-to output.wav --duration 30

# Check song length first
npm run cli -- verify mysong.bax
```

### Volume Too Quiet/Loud
**Symptoms:** Exported WAV is quieter/louder than browser playback
**Solutions:**
- Volume is normalized to prevent clipping (max 0.95)
- Adjust instrument envelope values in `.bax` file
- Post-process in audio editor (Audacity: Effect → Normalize)
- Import to DAW and adjust gain/limiter

### Missing Percussion
**Symptoms:** Channel 4 (noise) not rendering
**Solutions:**
- Verify instrument type is `noise`: `inst kick type=noise`
- Check named events: `snare`, `hihat`, `kick` must match instrument names
- Export channel 4 only to debug: `--channels 4`
- Verify envelope is not too quiet: `env=gb:12,down,1` (volume 12)

### Clicks or Pops
**Symptoms:** Audible clicks at note boundaries
**Solutions:**
- Increase envelope initial volume (e.g., `env=gb:15,down,1`)
- Reduce duty cycle for pulse channels
- Check for very short notes (<1 tick duration)
- Currently not smoothed; post-process with fade-in/out if needed

## Performance

**Rendering Speed:**
- ~1-2 seconds to render a 3-minute song (real-time factor: 90-180×)
- Faster than browser export (no UI overhead)
- Memory usage: ~10-20 MB for typical songs

**File Sizes:**
- 1 second stereo @ 44100 Hz = ~176 KB
- 1 minute = ~10 MB
- 5 minutes = ~50 MB

**Optimization Tips:**
- Use `--duration` to avoid rendering unnecessary silence
- Lower sample rate for smaller files: `--sample-rate 22050`
- Render channels individually if full mix not needed
- Compress WAV to MP3/OGG for distribution (use ffmpeg)

## Examples

### Basic Export
```bash
npm run cli -- play songs/sample.bax --render-to sample.wav
```

### High-Quality Export
```bash
npm run cli -- play mysong.bax --render-to mysong-hq.wav --sample-rate 48000 --duration 180
```

### Batch Export All Channels
```powershell
# PowerShell script to export all 4 channels
for ($i=1; $i -le 4; $i++) {
  npm run cli -- play mysong.bax --render-to "channel$i.wav" --channels $i
}
```

### Convert to MP3
```bash
# Export WAV then convert with ffmpeg
npm run cli -- play mysong.bax --render-to mysong.wav
ffmpeg -i mysong.wav -codec:a libmp3lame -b:a 192k mysong.mp3
```

### Compare with Browser Export
```bash
# CLI export
npm run cli -- play mysong.bax --render-to cli.wav

# Browser export (manual: open web UI, play, click "Export WAV")
# Then compare:
ffprobe -hide_banner cli.wav
ffprobe -hide_banner browser.wav

# Should show identical format and duration
```

## Resources

- [PCM Renderer Source](../packages/engine/src/audio/pcmRenderer.ts)
- [Node Audio Player Source](../packages/cli/src/nodeAudioPlayer.ts)
- [DEVNOTES - CLI Audio Implementation](../DEVNOTES.md#cli-audio-playback-implementation)
- [BeatBax Tutorial](../TUTORIAL.md)
- [Scheduler Documentation](scheduler.md)

## Support

For issues with WAV export:
1. Verify BeatBax is up to date: `git pull && npm install && npm run build`
2. Check test suite: `npm test`
3. Validate with `ffprobe` or MediaInfo
4. Compare with browser export to isolate renderer vs song issues
5. Open an issue with:
   - Example `.bax` file
   - Export command used
   - Expected vs actual output
   - File size and ffprobe output

## Future Enhancements

Planned features for future versions:
- **Pan control**: Stereo positioning per channel
- **Master volume**: Global gain adjustment
- **Fade in/out**: Smooth volume transitions at start/end
- **Sample rate conversion**: Better quality resampling
- **Real-time streaming**: Live playback without temp files
- **Progress indicator**: Show render progress for long songs
- **Lossy export**: Direct MP3/OGG export without intermediate WAV
