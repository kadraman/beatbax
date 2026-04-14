---
title: "Create plugin starter template repository on github.com/beatbax"
labels: ["enhancement", "plugins", "developer-experience"]
status: partial
authors: ["GitHub Copilot","kadraman"]
created: 2026-04-14
issue: "https://github.com/kadraman/beatbax/issues/86"

## Summary

Create a public GitHub template repository at **https://github.com/beatbax/plugin-chip-template** that gives third-party developers a complete, ready-to-clone starting point for building BeatBax chip plugins.

## Background

The plugin system (`docs/features/plugin-system.md`) is now fully implemented. `@beatbax/plugin-chip-nes` serves as the first external plugin and reference implementation. The remaining gap from Phase 5 of the plugin system spec is:

> - [ ] Add TypeScript template for new plugins
> - [ ] Create example plugin repository as a starter

The existing guide at `docs/creating-plugins.md` explains the concepts, but developers still need to manually scaffold the package structure, configure TypeScript, set up Jest, and wire up the `ChipPlugin` interface. A template repository eliminates that friction.

## Acceptance Criteria

- [ ] Repository created at `https://github.com/beatbax/plugin-chip-template`
- [ ] Marked as a **GitHub Template Repository** (Settings → check "Template repository")
- [ ] Repository is public and listed under the `beatbax` GitHub organisation
- [ ] Contains a working, buildable, testable skeleton that passes `npm test` out of the box
- [ ] `README.md` includes a "Use this template" button link and step-by-step quickstart
- [ ] All placeholder values (`{{CHIP_NAME}}`, `{{DESCRIPTION}}`, etc.) are clearly marked for replacement
- [ ] References `docs/creating-plugins.md` in the BeatBax main repo for full documentation

## Repository Structure

```
plugin-chip-template/
├── .github/
│   └── workflows/
│       └── ci.yml              # Run build + test on push/PR
├── src/
│   ├── index.ts                # ChipPlugin entry point (exports default plugin object)
│   ├── channel.ts              # Skeleton ChipChannelBackend implementation
│   ├── periodTables.ts         # Optional: frequency/period lookup table scaffold
│   └── validate.ts             # Optional: instrument validation helper scaffold
├── tests/
│   └── plugin.test.ts          # Skeleton unit tests (registration, channel creation, render)
├── package.json                # @your-scope/plugin-chip-{{name}}, peerDep: @beatbax/engine
├── tsconfig.json               # ESM, strict, targeting ES2022
├── jest.config.cjs             # ts-jest config matching BeatBax conventions
├── README.md                   # Quickstart, customisation checklist, publishing guide
├── CHANGELOG.md                # Empty initial changelog
└── LICENSE                     # MIT
```

## Source Content

### `src/index.ts`

```typescript
import type { ChipPlugin } from '@beatbax/engine';
import { createChannel } from './channel.js';
import { validateInstrument } from './validate.js';

/**
 * Replace CHIP_NAME with your chip's identifier (e.g. 'sid', 'genesis').
 * This string is used in the `chip <name>` directive in .bax files.
 */
const plugin: ChipPlugin = {
  name: 'CHIP_NAME',
  version: '0.1.0',
  channels: 1, // Set to the number of hardware voices your chip provides

  validateInstrument(inst) {
    return validateInstrument(inst);
  },

  createChannel(channelIndex, audioContext) {
    return createChannel(channelIndex, audioContext);
  },
};

export default plugin;
```

### `src/channel.ts`

```typescript
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';

export function createChannel(
  channelIndex: number,
  audioContext: BaseAudioContext
): ChipChannelBackend {
  let oscillator: OscillatorNode | null = null;
  let gainNode: GainNode | null = null;
  let currentFreq = 440;

  return {
    reset() {
      oscillator?.stop();
      oscillator?.disconnect();
      gainNode?.disconnect();
      oscillator = null;
      gainNode = null;
    },

    noteOn(frequency: number, instrument: InstrumentNode) {
      this.reset();
      currentFreq = frequency;

      oscillator = audioContext.createOscillator();
      gainNode = audioContext.createGain();

      oscillator.type = 'square'; // Replace with your chip's waveform
      oscillator.frequency.value = frequency;
      gainNode.gain.value = 0.5;

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
    },

    noteOff() {
      gainNode?.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);
      oscillator?.stop(audioContext.currentTime + 0.05);
    },

    setFrequency(frequency: number) {
      currentFreq = frequency;
      if (oscillator) {
        oscillator.frequency.value = frequency;
      }
    },

    applyEnvelope(frame: number) {
      // Implement per-frame hardware envelope automation here
    },

    render(buffer: Float32Array, sampleRate: number) {
      // Implement PCM rendering here (used in headless/CLI contexts)
      // ADD your output to the existing buffer contents (don't overwrite)
    },
  };
}
```

### `src/validate.ts`

```typescript
import type { InstrumentNode } from '@beatbax/engine';
import type { ValidationError } from '@beatbax/engine';

export function validateInstrument(inst: InstrumentNode): ValidationError[] {
  const errors: ValidationError[] = [];

  // Add chip-specific field validation here.
  // Example:
  // if (inst.duty !== undefined && ![12, 25, 50, 75].includes(Number(inst.duty))) {
  //   errors.push({ field: 'duty', message: 'duty must be 12, 25, 50, or 75' });
  // }

  return errors;
}
```

### `tests/plugin.test.ts`

```typescript
import { ChipRegistry } from '@beatbax/engine';
import plugin from '../src/index.js';

describe('plugin metadata', () => {
  it('has a valid name string', () => {
    expect(typeof plugin.name).toBe('string');
    expect(plugin.name.length).toBeGreaterThan(0);
  });

  it('has a valid version string', () => {
    expect(typeof plugin.version).toBe('string');
  });

  it('has a positive channel count', () => {
    expect(plugin.channels).toBeGreaterThan(0);
  });
});

describe('plugin registration', () => {
  it('registers without error', () => {
    const registry = new ChipRegistry();
    expect(() => registry.register(plugin)).not.toThrow();
  });

  it('is retrievable after registration', () => {
    const registry = new ChipRegistry();
    registry.register(plugin);
    expect(registry.has(plugin.name)).toBe(true);
    expect(registry.get(plugin.name)).toBe(plugin);
  });
});

describe('channel creation', () => {
  it('creates a channel for each index', () => {
    // Use a mock AudioContext for headless testing
    const mockCtx = { destination: {}, currentTime: 0 } as any;
    for (let i = 0; i < plugin.channels; i++) {
      expect(() => plugin.createChannel(i, mockCtx)).not.toThrow();
    }
  });

  it('throws for an out-of-range channel index', () => {
    const mockCtx = { destination: {}, currentTime: 0 } as any;
    expect(() => plugin.createChannel(plugin.channels, mockCtx)).toThrow();
  });
});
```

### `package.json`

```json
{
  "name": "@your-scope/plugin-chip-CHIP_NAME",
  "version": "0.1.0",
  "description": "CHIP_NAME APU chip plugin for BeatBax.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md"],
  "keywords": ["beatbax", "plugin", "chiptune", "CHIP_NAME"],
  "license": "MIT",
  "scripts": {
    "build": "tsc -b",
    "test": "jest --config ./jest.config.cjs --passWithNoTests",
    "prepublishOnly": "npm run build && npm test"
  },
  "peerDependencies": {
    "@beatbax/engine": "^0.8.0"
  },
  "devDependencies": {
    "@beatbax/engine": "^0.8.0",
    "@types/jest": "^29.5.12",
    "@types/node": "^22.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.3.0",
    "typescript": "^5.6.0"
  }
}
```

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm install
      - run: npm run build
      - run: npm test
```

## README Quickstart Content

The `README.md` should include:

1. **"Use this template"** button (GitHub renders this automatically for template repos)
2. **Quickstart** — clone, rename placeholders, implement, test, publish
3. **Checklist** — what to replace (`CHIP_NAME`, channel count, waveform logic, period tables if needed)
4. **Publishing** — `npm publish --access public` with the `@beatbax/plugin-chip-*` or `beatbax-plugin-chip-*` naming convention for CLI auto-discovery
5. **Link** to `https://github.com/beatbax/beatbax` main repo and `docs/creating-plugins.md`

## Implementation Notes

- The `@beatbax/engine` peerDependency should be pinned to the current stable range at time of template creation
- The Jest config should match the pattern used in `packages/plugins/chip-nes/jest.config.cjs` (ts-jest, ESM transform, `testEnvironment: node`)
- The CI workflow should mirror the NES plugin's CI setup
- Consider adding a `CONTRIBUTING.md` that links back to the main BeatBax contributing guide

## Related

- Feature spec: `docs/features/plugin-system.md` — Phase 5
- Full plugin guide: `docs/creating-plugins.md`
- Reference implementation: `packages/plugins/chip-nes/` in the main repo
- npm naming convention: `@beatbax/plugin-chip-<name>` (official) or `beatbax-plugin-chip-<name>` (community)
