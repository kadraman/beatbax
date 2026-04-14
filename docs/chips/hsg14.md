# HSG‑14
*A hybrid pulse/saw/PCM sound generator for fantasy consoles*

The **HSG‑14** (Hybrid Sound Generator) is a modern reinterpretation of late‑80s sound hardware. It blends pulse‑wave charm, SID‑like filters, and simple PCM playback while keeping the strict timing and limitations that define classic chiptune composition.

---

## Overview

| Feature | Details |
|--------|---------|
| **Voices** | 14 total (4 Pulse, 2 Saw, 2 Triangle, 2 Noise, 4 PCM) |
| **Synthesis** | Pulse, Sawtooth, Triangle, Noise, PCM, Custom Wave RAM |
| **Filters** | 12/24 dB LP, HP, BP; per‑voice routing |
| **Modulation** | ADSR envelopes, LFOs, macro sequencer |
| **Sample RAM** | 64 KB PCM RAM, 4 KB Wave RAM |
| **Output** | Selectable 4/8/12‑bit DAC, optional analog “warmth” stage |
| **Clock** | 60 Hz or 50 Hz frame‑timed, deterministic |

---

# Channels

## Pulse Channels (4)

Four independent pulse generators with variable duty cycles.

### Features
- Duty cycles: **12.5%, 25%, 50%, 75%**
- Frequency range: **32 Hz – 12 kHz**
- Optional **sweep unit** (up/down, variable rate)
- Optional **phase reset** for punchy bass
- Hardware ADSR envelope
- LFO modulation for pitch or duty cycle

### Use Cases
- Leads
- Basslines
- Arpeggios
- Chords (via rapid duty/pitch macros)

---

## Sawtooth Channels (2)

Two SID‑inspired sawtooth oscillators.

### Features
- Classic ramp waveform
- Optional **alias‑free mode**
- **Hard sync** between saw channels
- Filter routing available
- ADSR + LFO modulation

### Use Cases
- Bright leads
- Sync‑sweep effects
- Warm pads (with filter)

---

## Triangle Channels (2)

Two triangle oscillators with selectable quantisation.

### Modes
- **Clean**: smooth 8‑bit triangle
- **Quantised**: NES‑style stepped waveform

### Use Cases
- Bass
- Soft leads
- Sub‑layers

---

## Noise Channels (2)

Two noise generators using LFSR sequences.

### Features
- LFSR lengths: **7‑bit, 15‑bit, 23‑bit**
- Clock‑rate modulation for metallic or crunchy textures
- ADSR envelope
- Optional “burst” mode for short percussive hits

### Use Cases
- Drums
- Sound effects
- Wind / ambience

---

## PCM Channels (4)

Four low‑cost PCM playback channels.

### Features
- 8‑bit or 4‑bit DPCM
- Hardware pitch control
- Looping or one‑shot modes
- “Grit mode” adds quantisation noise
- 64 KB shared sample RAM

### Use Cases
- Drum samples
- Vocal stabs
- FM‑style single‑cycle waves
- Ambient textures

---

# Wave RAM

The X1 includes **4 KB of Wave RAM** for custom single‑cycle waveforms.

### Wave RAM Features
- 256 user‑defined waveforms
- 32‑byte per‑wave format
- Assignable to **Pulse**, **Saw**, or **PCM** channels
- Optional interpolation or raw mode

---

# Filters

A flexible analog‑modelled filter block inspired by the SID.

### Filter Types
- **Low‑pass** (12 dB / 24 dB)
- **High‑pass**
- **Band‑pass**

### Routing
Each voice can be routed:
- **Pre‑filter**
- **Post‑filter**
- **Bypassed**

### Resonance
- Stable mode
- “Dirty” mode (adds analog‑style instability)

---

# Modulation

## ADSR Envelopes
Each channel has a hardware envelope:
- Attack: 0–255 steps
- Decay: 0–255
- Sustain: 0–255
- Release: 0–255
- Optional exponential curves

## LFOs
Each voice has one LFO:
- Shapes: **Triangle, Square, Random, Sample‑and‑Hold**
- Destinations: **Pitch, Duty, Filter Cutoff, Volume**
- Sync to frame clock or free‑run

## Macro Sequencer
A tiny per‑voice sequencer for:
- Arpeggios
- Duty sweeps
- Vibrato patterns
- Drum macros
- Rapid pitch effects

---

# Timing & Clocking

The X1 is designed for **deterministic playback**.

### Frame Clock
- 60 Hz (NTSC‑style)
- 50 Hz (PAL‑style)

### Cycle Accuracy
- Envelopes, LFOs, and macros update on fixed cycles
- Ensures perfect repeatability across platforms

---

# Output

### DAC
- Selectable **4‑bit**, **8‑bit**, or **12‑bit** output
- 4‑bit mode introduces classic crunchy distortion
- 12‑bit mode is clean but still “retro”

### Analog Stage
Optional analog coloration:
- Soft clipping
- Slight saturation
- High‑frequency roll‑off

---

# Registers

| Address | Name | Description |
|---------|------|-------------|
| 0x00–0x1F | Pulse 1 | Frequency, duty, envelope, LFO |
| 0x20–0x3F | Pulse 2 | Same as above |
| 0x40–0x5F | Pulse 3 | Same as above |
| 0x60–0x7F | Pulse 4 | Same as above |
| 0x80–0x9F | Saw 1 | Frequency, sync, envelope |
| 0xA0–0xBF | Saw 2 | Frequency, sync, envelope |
| 0xC0–0xDF | Triangle 1 | Frequency, mode |
| 0xE0–0xFF | Triangle 2 | Frequency, mode |
| 0x100–0x13F | Noise 1 | LFSR mode, clock, envelope |
| 0x140–0x17F | Noise 2 | Same as above |
| 0x180–0x1FF | PCM Channels | Sample start, length, pitch |
| 0x200–0x21F | Filter | Cutoff, resonance, routing |
| 0x220–0x23F | Global | Master volume, DAC mode, clock mode |

---

# Tracker Commands

| Command | Description |
|---------|-------------|
| Vxx | Set volume (0–FF) |
| Pxx | Set pulse duty |
| Lxx | LFO depth |
| Sxx | LFO speed |
| Axx | Arpeggio macro |
| Fxx | Filter cutoff |
| Rxx | Resonance |
| Wxx | Waveform select |

---

# Summary

The **HSG‑14** is a flexible but characterful sound chip designed for fantasy consoles, retro‑styled games, and chiptune composition. It captures the charm of classic hardware while offering modern conveniences like filters, LFOs, and expanded polyphony.
