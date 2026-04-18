# Creating BeatBax Chip Plugins

This guide explains how to build, publish, and install chip plugins for BeatBax. Chip plugins extend the engine with new audio backends — enabling music production for additional retro hardware platforms (NES, SID, YM2612, etc.) without changes to the core engine.

---

## Overview

A BeatBax chip plugin is a plain npm package that:

1. Exports a default object implementing the `ChipPlugin` interface.
2. Is published under the npm naming convention `@beatbax/plugin-chip-<name>` (official) or `beatbax-plugin-chip-<name>` (community).
3. Registered with the engine via `engine.registerChipPlugin(plugin)` or auto-discovered by the CLI.

The Game Boy plugin (`packages/engine/src/chips/gameboy/plugin.ts`) is the built-in reference implementation and the simplest example to study.

---

## Interfaces

### `ChipPlugin`

```typescript
import type { ChipPlugin } from '@beatbax/engine';

const myPlugin: ChipPlugin = {
  name: 'my-chip',            // Used in `chip my-chip` directive
  version: '1.0.0',           // Semver (see Step 3 for the recommended pattern)
  channels: 4,                // Number of audio channels

  /**
   * The integer range used by `vol` and `env` level fields in instrument
   * definitions for this chip. Drives the instrument volume indicator in the
   * web-ui Channel Mixer.
   *
   * - `min`/`max` are inclusive raw hardware values.
   * - `isAttenuation`: when true, min=loudest, max=silent (e.g. Genesis YM2612).
   * Defaults to { min: 0, max: 15 } when omitted.
   *
   * Common values:  Game Boy / NES: { min:0, max:15 }
   *                 PC-Engine:       { min:0, max:31 }
   *                 Sega Genesis:    { min:0, max:127, isAttenuation:true }
   */
  instrumentVolumeRange: { min: 0, max: 15 },

  validateInstrument(inst) {
    // Return [] if valid; array of ValidationError if not
    return [];
  },

  createChannel(channelIndex, audioContext) {
    // Return a ChipChannelBackend for the given channel
    return new MyChannelBackend(channelIndex);
  },

  // Optional: tailor the web editor experience to this chip
  uiContributions: {
    copilotSystemPrompt: '...hardware description and style guide...',
    hoverDocs: { inst: '...', pulse1: '...' },
    helpSections: [{ id: 'instruments', title: 'Instruments (My Chip)', content: [] }],
  },
};
```

### `ChipChannelBackend`

```typescript
import type { ChipChannelBackend } from '@beatbax/engine';

class MyChannelBackend implements ChipChannelBackend {
  reset(): void { /* reset all state */ }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    // Trigger a note: store frequency and instrument state
  }

  noteOff(): void {
    // Silence the channel (release)
  }

  applyEnvelope(frame: number): void {
    // Advance per-frame envelope/sweep automation (called once per audio frame)
  }

  render(buffer: Float32Array, sampleRate: number): void {
    // ADD your channel's audio output to `buffer` (do NOT overwrite)
    // buffer.length is the number of samples to render
  }
}
```

> **Important:** `render()` must **add** to the buffer (`buffer[i] += ...`), not overwrite it. Multiple channels are mixed by accumulation.

---

## Step-by-step Guide

### Step 1: Create the package

Use the naming convention for auto-discovery:

```bash
mkdir -p my-chip-plugin/src my-chip-plugin/tests
cd my-chip-plugin
```

**`package.json`:**

```json
{
  "name": "@beatbax/plugin-chip-my-chip",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "peerDependencies": {
    "@beatbax/engine": "^0.8.0"
  },
  "scripts": {
    "build": "tsc -b",
    "test": "jest --config ./jest.config.cjs"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.3.3",
    "typescript": "^5.6.3"
  }
}
```

### Step 2: Define channel backends

Create one backend class per channel type. Each class implements `ChipChannelBackend`.

```typescript
// src/pulse.ts
import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';

export class MyPulseBackend implements ChipChannelBackend {
  private active = false;
  private freq = 0;
  private phase = 0;

  reset() { this.active = false; this.freq = 0; this.phase = 0; }

  noteOn(frequency: number, _instrument: InstrumentNode) {
    this.freq = frequency;
    this.active = true;
    this.phase = 0;
  }

  noteOff() { this.active = false; }

  applyEnvelope(_frame: number) { /* add envelope automation here */ }

  render(buffer: Float32Array, sampleRate: number) {
    if (!this.active || this.freq <= 0) return;
    const phaseInc = this.freq / sampleRate;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] += this.phase < 0.5 ? 0.3 : -0.3;   // square wave
      this.phase = (this.phase + phaseInc) % 1;
    }
  }
}
```

### Step 3: Create the plugin entry point

Create a dedicated `src/version.ts` that exports the version as a plain constant. This is required to avoid the Node.js v22+ `ERR_IMPORT_ATTRIBUTE_MISSING` error that occurs when importing JSON with `import { version } from '../package.json'` (ESM JSON imports need a `with { type: 'json' }` assertion that TypeScript doesn't emit):

```typescript
// src/version.ts — keep in sync with package.json manually or via a build script
export const version = '0.1.0';
```

Then import it in your entry point:

```typescript
// src/index.ts
import type { ChipPlugin } from '@beatbax/engine';
import { version } from './version.js';
import { MyPulseBackend } from './pulse.js';

const myPlugin: ChipPlugin = {
  name: 'my-chip',
  version,
  channels: 2,

  validateInstrument(inst) {
    const errors = [];
    if (!['pulse1', 'pulse2'].includes((inst.type || '').toLowerCase())) {
      errors.push({ field: 'type', message: `Unknown type '${inst.type}'` });
    }
    return errors;
  },

  createChannel(channelIndex, _audioContext) {
    switch (channelIndex) {
      case 0: return new MyPulseBackend();
      case 1: return new MyPulseBackend();
      default: throw new Error(`my-chip: invalid channel index ${channelIndex}`);
    }
  },
};

export default myPlugin;
```

### Step 3b: Add web UI contributions (optional)

If your plugin will be used with the BeatBax web editor, add a `uiContributions` object so the editor shows chip-correct hover documentation, help panel content, and Copilot prompts when a song using your chip is active. See the [Web UI Contributions](#web-ui-contributions) section below for the full interface and rules.

```typescript
// src/ui-contributions.ts
import type { ChipUIContributions } from '@beatbax/engine';

export const myChipUIContributions: ChipUIContributions = {
  copilotSystemPrompt: `
══ MY CHIP HARDWARE — READ FIRST ══
... hardware layout ...
`.trim(),

  hoverDocs: {
    inst: [
      '**Instrument definition** — declares a named instrument with channel type and parameters.',
      '\`\`\`\ninst <name> type=<type> [field=value …]\n\`\`\`',
      '**Common fields (all chips):**',
      '- \`note\` — default note when instrument name is used as a hit token, e.g. \`note=C2\`',
      '- \`gm\` — General MIDI program number for MIDI export (0–127)',
      '',
      '**My Chip instrument types:**',
      '- \`type=pulse1\` — ...',
      '- \`type=pulse2\` — ...',
      '',
      'Example: \`inst lead type=pulse1 duty=50\`',
    ].join('\n\n'),
    pulse1: '**Pulse 1** — ...',
  },

  helpSections: [
    {
      id: 'instruments',       // replaces the built-in 'instruments' placeholder
      title: 'Instruments (My Chip)',
      content: [
        { kind: 'text', text: 'My Chip has two pulse channels...' },
        { kind: 'snippet', label: 'Pulse instrument', code: 'inst lead type=pulse1 duty=50' },
      ],
    },
    {
      id: 'examples',          // replaces the built-in 'examples' placeholder
      title: 'Examples — Click to Insert (My Chip)',
      content: [
        {
          kind: 'snippet',
          label: 'Minimal song',
          code: `chip my-chip\nbpm 120\n\ninst lead type=pulse1 duty=50\n\npat a = C4 E4 G4\nseq main = a a\n\nchannel 1 => inst lead seq main\n\nplay`,
        },
      ],
    },
  ],
};
```

Then wire it into your plugin:

```typescript
// src/index.ts (updated)
import { myChipUIContributions } from './ui-contributions.js';

const myPlugin: ChipPlugin = {
  // ... audio fields ...
  uiContributions: myChipUIContributions,
};
```

### Step 4: Register with the engine

```typescript
import { BeatBaxEngine } from '@beatbax/engine';
import myPlugin from '@beatbax/plugin-chip-my-chip';

const engine = new BeatBaxEngine();
engine.registerChipPlugin(myPlugin);

console.log(engine.listChips()); // ['gameboy', 'my-chip']
console.log(engine.validateChip('my-chip')); // true
```

### Step 5: Use in BeatBax scripts

```bax
chip my-chip
bpm 120

inst lead type=pulse1 duty=50
inst bass type=pulse2 duty=25

pat melody = C4 E4 G4 E4
seq main = melody melody

channel 1 => inst lead seq main
channel 2 => inst bass seq main:oct(-1)

play
```

---

## CLI Auto-Discovery

The BeatBax CLI automatically discovers installed plugins matching:
- `@beatbax/plugin-chip-*` — official plugins
- `beatbax-plugin-chip-*` — community plugins

After installing your plugin (`npm install @beatbax/plugin-chip-my-chip`), it is available in all CLI commands without any configuration:

```bash
# List all available chips (built-in + plugins)
beatbax list-chips
```

The command shows only canonical chip names (no duplicate alias entries). Registered aliases are shown inline:

```
Available chip backends:

  • gameboy (built-in)  [also: gb, dmg]
      Version:  0.10.0
      Channels: 4

  • nes
      Version:  0.2.0
      Channels: 5

  • my-chip
      Version:  0.1.0
      Channels: 2
```

Use `--json` for machine-readable output (includes an `aliases` array per entry):

```bash
beatbax list-chips --json
```

```json
[
  { "name": "gameboy", "version": "0.10.0", "channels": 4, "aliases": ["gb", "dmg"] },
  { "name": "nes",     "version": "0.2.0",  "channels": 5, "aliases": [] }
]
```

```bash
# Verify a NES song file (after installing @beatbax/plugin-chip-nes)
beatbax verify song.bax

# Export with any registered chip
beatbax export json song.bax output.json
```

---

## Naming Conventions

| Pattern | Use |
|---------|-----|
| `@beatbax/plugin-chip-<name>` | Official BeatBax-maintained plugins |
| `beatbax-plugin-chip-<name>` | Community plugins (auto-discovered) |
| `name` field in `ChipPlugin` | Must match the string used in `chip <name>` directive |

---

## Web UI Contributions

Plugins can provide an optional `uiContributions` object on the `ChipPlugin` to tailor the BeatBax web editor experience whenever a song using that chip is the active document. The web editor uses three surfaces:

| Surface | When used | What it does |
|---------|-----------|---------------|
| **Copilot system prompt** | Sent with every AI chat request | Describes the chip's hardware layout and style guide to the AI |
| **Hover docs** | User hovers over a keyword in the editor | Shows chip-specific Markdown documentation for that token |
| **Help panel sections** | Help & Reference panel is open | Provides chip-specific instrument definitions and click-to-insert examples |

All three surfaces switch automatically when the parser detects a `chip <name>` directive change — no user action required.

### Interface

```typescript
import type { ChipUIContributions, ChipHelpSection } from '@beatbax/engine';

// One section of the Help & Reference panel
interface ChipHelpSection {
  /** Matches an existing built-in section id to *replace* it, or a new id to *append* it. */
  id: string;
  title: string;
  content: Array<
    | { kind: 'text';    text: string }
    | { kind: 'snippet'; label: string; code: string }
  >;
}

interface ChipUIContributions {
  /** Injected into the AI system prompt in place of the default hardware block. */
  copilotSystemPrompt: string;

  /** keyword → Markdown string; merged *over* built-in hover docs (chip wins). */
  hoverDocs: Record<string, string>;

  /**
   * Sections to add or replace in the Help panel.
   * id='instruments' and id='examples' replace the built-in chip-agnostic placeholders.
   * Any other id is appended after the built-in sections.
   */
  helpSections: ChipHelpSection[];
}
```

### Hover doc conventions

All chips should follow the same structure for the `inst` hover entry so the docs are consistent across chips:

```typescript
hoverDocs: {
  inst: [
    '**Instrument definition** — declares a named instrument with channel type and parameters.',
    '```\ninst <name> type=<type> [field=value …]\n```',
    '**Common fields (all chips):**',
    '- `note` — default note when instrument name is used as a hit token, e.g. `note=C2`',
    '- `gm` — General MIDI program number for MIDI export (0–127)',
    '',
    '**My Chip instrument types:**',
    '- `type=pulse1` — `duty`, `env`, ...',
    '- `type=pulse2` — ...',
    '',
    'Example: `inst lead type=pulse1 duty=50`',
  ].join('\n\n'),
},
```

### Help section ids

The built-in Help panel contains placeholder sections for `instruments` and `examples` that show a generic message until a chip plugin replaces them. Use these ids to supply chip-specific content:

| `id` | Built-in placeholder | What to put here |
|------|---------------------|------------------|
| `instruments` | "Load a song to see chip docs" | All instrument types with code snippets |
| `examples` | "Load a song to see examples" | Click-to-insert full song examples |

Any `id` that does not match an existing built-in section is **appended** at the bottom of the panel — use this for entirely new sections (e.g. `'dmc-samples'`).

### Copilot prompt guidelines

- Open with a clear hardware header: `══ MY CHIP HARDWARE — READ FIRST ══`
- List channel count, fixed channel-to-type mapping, and hard constraints (e.g. "channel 5 is DMC only").
- Document all `inst` fields relevant to the chip.
- Follow the header with a style guide section describing characteristic techniques.
- Keep it concise — the prompt is injected verbatim and counts against the AI context window.

See `packages/engine/src/chips/gameboy/ui-contributions.ts` and `packages/plugins/chip-nes/src/ui-contributions.ts` for complete reference implementations.

---

## Sample Asset Resolution

Plugins that support sampled audio (like NES DMC) can implement `resolveSampleAsset()`:

```typescript
const myPlugin: ChipPlugin = {
  // ...
  bundledSamples: {
    'my-drum': '<base64-encoded-data>',
  },

  async resolveSampleAsset(ref: string): Promise<ArrayBuffer> {
    if (ref.startsWith('@my-chip/')) {
      const name = ref.slice(9);
      const b64 = this.bundledSamples![name];
      if (!b64) throw new Error(`Unknown bundled sample: ${name}`);
      // Decode base64 and return ArrayBuffer
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      return bytes.buffer;
    }
    throw new Error(`Unsupported sample scheme: ${ref}`);
  },
};
```

Security guidelines follow the BeatBax import security model (`docs/language/import-security.md`):
- `@<chip>/<name>` — bundled library (safe in all environments)
- `https://...` — remote fetch (browser + Node.js 18+)
- `local:<path>` — file system (Node.js only; reject path traversal with `..`)

---

## Dual Rendering: PCM and Web Audio

BeatBax uses two audio rendering paths depending on the runtime environment:

| Path | Used when | Effects support |
|------|-----------|-----------------|
| **PCM** (`render()`) | CLI, headless, Node.js | None (no AudioParam automation) |
| **Web Audio** (`createPlaybackNodes()`) | Browser / Electron | Full (arp, vib, portamento, retrigger, echo…) |

**Melodic channels** (pulse, triangle) should implement **both** so that:
- The CLI produces audio via the `render()` PCM loop.
- The web-ui uses `createPlaybackNodes()` and gets the full effects system for free.

**Percussion/sample channels** (noise, DMC) only need `render()` since they don't use melodic effects.

### Implementing `createPlaybackNodes()`

```typescript
import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';

class MyPulseBackend implements ChipChannelBackend {
  // ... PCM fields / reset / noteOn / noteOff / applyEnvelope / render ...

  createPlaybackNodes(
    ctx: BaseAudioContext,
    freq: number,
    start: number,       // absolute AudioContext time for the note onset
    dur: number,         // note duration in seconds
    inst: InstrumentNode,
    _scheduler: any,
    destination: AudioNode
  ): AudioNode[] | null {
    if (typeof (ctx as any).createOscillator !== 'function') return null;

    const osc = (ctx as any).createOscillator();
    const gain = (ctx as any).createGain();

    // 1. Set waveform (PeriodicWave or built-in type)
    osc.type = 'square';

    // 2. Set frequency; MUST store _baseFreq so the arp effect can read it
    osc.frequency.setValueAtTime(freq, start);
    (osc as any)._baseFreq = freq;

    // 3. Wire nodes: oscillator → gain → destination
    osc.connect(gain);
    gain.connect(destination);

    // 4. Schedule amplitude envelope on gain.gain AudioParam
    const vol = Number(inst.vol ?? 1);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.linearRampToValueAtTime(0.0001, start + dur + 0.005);

    // 5. Schedule note lifetime
    osc.start(start);
    osc.stop(start + dur + 0.02);

    // 6. Return [oscillatorNode, gainNode] — the engine applies effects to these
    return [osc, gain];
  }
}
```

**Key requirements:**
- `(osc as any)._baseFreq` must be set **before** returning so the `arp` effect can read the base pitch for semitone offsets.
- Return `null` if the context is not a Web Audio context (e.g. a mock in tests) to fall back to PCM.
- Connect `osc → gain → destination`; the engine inserts effects (pan, echo) between `gain` and `destination` automatically.
- Call `osc.start(start)` / `osc.stop(start + dur + 0.02)` using the provided `start` time, not `ctx.currentTime`.

**The NES plugin** (`packages/plugins/chip-nes/src/pulse.ts` and `triangle.ts`) is the canonical example of the dual-path pattern with duty-cycle `PeriodicWave`, envelope scheduling, and hardware sweep animation.

---

## Testing

Use the `ChipRegistry` directly in tests:

```typescript
import { ChipRegistry } from '@beatbax/engine';
import myPlugin from '../src/index.js';

test('plugin registers successfully', () => {
  const reg = new ChipRegistry();
  reg.register(myPlugin);
  expect(reg.has('my-chip')).toBe(true);
  // listCanonical() returns only real plugin names, not aliases
  expect(reg.listCanonical()).toContain('my-chip');
});

test('aliases are listed correctly', () => {
  const reg = new ChipRegistry();
  reg.register(myPlugin);
  reg.registerAlias('mc', 'my-chip');
  // aliasesFor() returns all aliases pointing to a canonical name
  expect(reg.aliasesFor('my-chip')).toEqual(['mc']);
  // list() still includes both canonical and alias names (for parser validation)
  expect(reg.list()).toContain('mc');
  // listCanonical() does NOT include aliases
  expect(reg.listCanonical()).not.toContain('mc');
});

test('channel 0 renders audio', () => {
  const backend = myPlugin.createChannel(0, {} as BaseAudioContext);
  backend.noteOn(440, { type: 'pulse1' });
  const buf = new Float32Array(256);
  backend.render(buf, 44100);
  expect(buf.some(s => s !== 0)).toBe(true);
});
```

For Jest configuration, map `@beatbax/engine` to the plugin API entry point to avoid ESM issues:

```javascript
// jest.config.cjs
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@beatbax/engine$': '<rootDir>/node_modules/@beatbax/engine/dist/plugin-api.js',
  },
};
```

---

## Reference: Built-in Plugins

| Plugin | Package | Channels | Status |
|--------|---------|----------|--------|
| Game Boy DMG-01 APU | built-in | 4 | ✅ Complete |
| NES Ricoh 2A03 APU | `@beatbax/plugin-chip-nes` | 5 | ✅ Complete |
| C64 SID | `@beatbax/plugin-chip-sid` | 3 | 📋 Planned |
| Sega Genesis YM2612 + PSG | `@beatbax/plugin-chip-genesis` | 10 | 📋 Planned |

See `docs/features/plugin-system.md` for the complete plugin system specification and roadmap.
