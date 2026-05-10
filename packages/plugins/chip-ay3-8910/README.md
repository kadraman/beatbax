# @beatbax/plugin-chip-ay3-8910

AY-3-8910 / YM2149 chip plugin for BeatBax.

## Features

- 3 PSG channels with tone + noise mixing
- AY envelope shapes (`env=...`)
- Noise rate control (`noise_rate=0..31`)
- Dual render path: PCM + Web Audio (tone)
- New Song Wizard templates for Atari ST and MSX
- Optional VGM exporter integration

## Usage

```ts
import { BeatBaxEngine } from '@beatbax/engine';
import ayPlugin from '@beatbax/plugin-chip-ay3-8910';

const engine = new BeatBaxEngine();
engine.registerChipPlugin(ayPlugin);
```

```bax
chip atari-st
bpm 140

inst lead type=tone env=attack_decay vol=use_envelope
inst bass type=tone env=decay_only vol=12
inst kick type=noise noise=on noise_rate=10 env=decay_quick vol=14

pat a = C5 E5 G5 A5
seq main = a a

channel 1 => inst lead seq main
channel 2 => inst bass seq main:oct(-1)
channel 3 => inst kick seq main

play
```
