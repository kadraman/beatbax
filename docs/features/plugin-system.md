# Feature: Plugin System for Chip Backends

**Status:** Planned (Post-MVP)  
**Priority:** High  
**Dependencies:** Monorepo refactoring  
**Tracking Issue:** TBD  
**Supersedes:** `dynamic-chip-loading.md` (merged into this spec)

## Overview

Create a plugin system that allows chip backends (NES, SID, Genesis, etc.) to be installed and loaded dynamically at runtime. This enables the BeatBax engine to remain lightweight while supporting extensible audio backends through npm packages.

This spec combines the npm plugin distribution model with runtime dynamic loading strategies for maximum flexibility across Node.js, browser, and bundled environments.

## Motivation

- **Lightweight Core:** Users only install the chips they need (e.g., `@beatbax/engine` + `@beatbax/plugin-chip-nes`)
- **Community Extensions:** Third-party developers can create and publish their own chip backends
- **Clean Separation:** Each chip backend is independently versioned, tested, and maintained
- **Tree-Shaking:** Bundlers can eliminate unused chip code from browser builds
- **Progressive Enhancement:** Start with Game Boy, add other chips as needed

## User Experience

### Installation

```bash
# Core engine only (includes Game Boy)
npm install @beatbax/engine

# Add NES support
npm install @beatbax/plugin-chip-nes

# Add SID support
npm install @beatbax/plugin-chip-sid
```

### Usage in Code

```typescript
import { BeatBaxEngine } from '@beatbax/engine';
import nesPlugin from '@beatbax/plugin-chip-nes';
import sidPlugin from '@beatbax/plugin-chip-sid';

const engine = new BeatBaxEngine();

// Register plugins
engine.registerChipPlugin(nesPlugin);
engine.registerChipPlugin(sidPlugin);

// Now scripts can use these chips
const script = `
chip nes
bpm 140
inst lead type=pulse1 duty=50 env=12,down
pat A = C4 E4 G4 C5
channel 1 => inst lead seq A
play
`;

engine.loadScript(script);
engine.play();
```

### CLI Auto-Discovery

```bash
# CLI automatically discovers installed plugins
npm install -g @beatbax/cli
npm install -g @beatbax/plugin-chip-nes

# Now the CLI can play NES songs
beatbax play song.bax --chip nes
```

## Language Surface

The `chip` directive already exists in the language:

```
chip gameboy   # Default, built-in
chip nes       # Requires @beatbax/plugin-chip-nes
chip sid       # Requires @beatbax/plugin-chip-sid
chip genesis   # Requires @beatbax/plugin-chip-genesis
```

The parser validates that the requested chip is registered before compilation.

## Technical Design

### Plugin Interface

```typescript
// packages/engine/src/chips/types.ts

export interface ChipChannelBackend {
  reset(): void;
  noteOn(frequency: number, instrument: InstrumentState): void;
  noteOff(): void;
  applyEnvelope(frame: number): void;
  render(buffer: Float32Array, sampleRate: number): void;
}

export interface ChipPlugin {
  name: string;                    // 'gameboy', 'nes', 'sid', etc.
  version: string;                 // Semver
  channels: number;                // Number of audio channels
  
  // Validate instrument definition for this chip
  validateInstrument(inst: InstrumentDef): ValidationError[];
  
  // Create a channel backend instance
  createChannel(channelIndex: number, audioContext: AudioContext): ChipChannelBackend;
  
  // Optional: Convert instrument to native format
  instrumentToNative?(inst: InstrumentDef): any;
  
  // Optional: Export support
  exportToNative?(song: SongModel): Uint8Array;
}
```

### Plugin Registry

```typescript
// packages/engine/src/chips/registry.ts

export class ChipRegistry {
  private plugins = new Map<string, ChipPlugin>();
  
  constructor() {
    // Game Boy is always available (built-in)
    this.register(gameboyPlugin);
  }
  
  register(plugin: ChipPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Chip plugin '${plugin.name}' is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
  }
  
  get(chipName: string): ChipPlugin | undefined {
    return this.plugins.get(chipName);
  }
  
  has(chipName: string): boolean {
    return this.plugins.has(chipName);
  }
  
  list(): string[] {
    return Array.from(this.plugins.keys());
  }
}

// Global singleton
export const chipRegistry = new ChipRegistry();
```

### Engine Integration

```typescript
// packages/engine/src/index.ts

export class BeatBaxEngine {
  private registry = chipRegistry;
  
  registerChipPlugin(plugin: ChipPlugin): void {
    this.registry.register(plugin);
  }
  
  loadScript(script: string): void {
    const ast = parse(script);
    const chipName = ast.chip || 'gameboy';
    
    if (!this.registry.has(chipName)) {
      throw new Error(
        `Chip '${chipName}' is not available. Install @beatbax/plugin-chip-${chipName}`
      );
    }
    
    // Continue with compilation...
  }
}
```

### Plugin Package Structure

Each plugin is a standalone npm package:

```
packages/plugins/chip-nes/
├── package.json
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── pulse.ts              # NES pulse channels
│   ├── triangle.ts           # NES triangle channel
│   ├── noise.ts              # NES noise channel
│   ├── dmc.ts                # NES DMC channel
│   └── periodTables.ts       # NES frequency tables
├── tests/
│   └── nes.test.ts
└── README.md
```

Example `package.json`:

```json
{
  "name": "@beatbax/plugin-chip-nes",
  "version": "1.0.0",
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
    "@beatbax/engine": "^1.0.0"
  },
  "keywords": ["beatbax", "plugin", "nes", "chiptune"]
}
```

### CLI Auto-Discovery

The CLI can automatically discover installed plugins:

```typescript
// packages/cli/src/plugins.ts

export function discoverPlugins(): ChipPlugin[] {
  const plugins: ChipPlugin[] = [];
  const pkgJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  
  for (const [name, version] of Object.entries(deps)) {
    if (name.startsWith('@beatbax/plugin-chip-')) {
      try {
        const plugin = await import(name);
        plugins.push(plugin.default);
      } catch (err) {
        console.warn(`Failed to load plugin ${name}:`, err);
      }
    }
  }
  
  return plugins;
}
```

## Dynamic Loading Strategies

### Node.js (CLI/Server)

Use native ESM `import()` for runtime loading:

```typescript
async function loadPlugin(chipName: string): Promise<ChipPlugin> {
  const modulePath = `@beatbax/plugin-chip-${chipName}`;
  const module = await import(modulePath);
  return module.default;
}
```

### Browser (Bundled)

For Vite/Webpack/esbuild, provide a static registry with explicit imports:

```typescript
// packages/engine/src/chips/static-registry.ts
import gameboyPlugin from './gameboy';
import nesPlugin from '@beatbax/plugin-chip-nes'; // optional dependency

export const staticRegistry: Record<string, ChipPlugin> = {
  gameboy: gameboyPlugin,
  // Only include if package is installed
  ...(nesPlugin ? { nes: nesPlugin } : {})
};
```

### Browser (Runtime CDN)

For unbundled browsers using import maps:

```html
<script type="importmap">
{
  "imports": {
    "@beatbax/engine": "https://cdn.jsdelivr.net/npm/@beatbax/engine/+esm",
    "@beatbax/plugin-chip-nes": "https://cdn.jsdelivr.net/npm/@beatbax/plugin-chip-nes/+esm"
  }
}
</script>
```

### Fallback Chain

The engine tries loading strategies in order:

1. **Registry lookup** (if pre-registered via `registerChipPlugin()`)
2. **Dynamic import** (Node.js, modern bundlers)
3. **Static registry** (bundler with tree-shaking)
4. **Error:** Chip not available, suggest installation

## Implementation Checklist

### Phase 1: Core Plugin API (Engine)
- [ ] Define `ChipPlugin` and `ChipChannelBackend` interfaces in `packages/engine/src/chips/types.ts`
- [ ] Create `ChipRegistry` class in `packages/engine/src/chips/registry.ts`
- [ ] Refactor existing Game Boy chip to implement `ChipPlugin` interface
- [ ] Update `BeatBaxEngine` to use registry for chip selection
- [ ] Update parser to validate chip names against registry
- [ ] Add error messages for missing plugins
- [ ] Write unit tests for registry and plugin loading

### Phase 2: Extract Game Boy as Plugin (Proof of Concept)
- [ ] Keep Game Boy built-in but implement it as a plugin internally
- [ ] Verify no regressions in existing tests
- [ ] Document plugin API in `/docs/plugin-api.md`

### Phase 3: Create First External Plugin (NES)
- [ ] Create `packages/plugins/chip-nes/` with proper structure
- [ ] Implement NES APU channels (2 pulse, 1 triangle, 1 noise, 1 DMC)
- [ ] Add NES period tables and frequency mappings
- [ ] Write tests for NES plugin
- [ ] Add example NES song in `/songs/nes-example.bax`

### Phase 4: CLI Auto-Discovery
- [ ] Implement `discoverPlugins()` in CLI
- [ ] Auto-register discovered plugins on startup
- [ ] Add `--list-chips` flag to show available chips
- [ ] Update CLI help text to mention plugin system

### Phase 5: Documentation & Examples
- [ ] Create `/docs/creating-plugins.md` guide
- [ ] Document plugin lifecycle and best practices
- [ ] Add TypeScript template for new plugins
- [ ] Create example plugin repository as a starter

### Phase 6: Additional Plugins (Post-Launch)
- [ ] Create `@beatbax/plugin-chip-sid` (C64)
- [ ] Create `@beatbax/plugin-chip-genesis` (YM2612 + PSG)
- [ ] Create `@beatbax/plugin-chip-pce` (PC Engine)
- [ ] Community plugin submissions via GitHub

## Testing Strategy

### Unit Tests
- Plugin registration and retrieval
- Duplicate plugin name rejection
- Missing plugin error handling
- Plugin interface validation

### Integration Tests
- Load script with `chip nes` directive
- Switch between chips in same session
- CLI auto-discovery with mock plugins
- Plugin-specific instrument validation

### Validation Tests
- Plugins must implement all required methods
- Plugins must return valid channel backends
- Channel backends must render audio without crashes

## Success Metrics

- ✅ Core engine bundle size remains under 50KB (gzipped)
- ✅ NES plugin can be installed and used independently
- ✅ CLI auto-discovers and loads plugins without manual configuration
- ✅ Plugin API is documented and stable for external developers
- ✅ At least 2 community-contributed plugins within 6 months of release

## Migration Strategy

1. **Phase 1:** Add plugin API to engine (Game Boy remains built-in)
2. **Phase 2:** Refactor Game Boy to use plugin interface internally (no external changes)
3. **Phase 3:** Create first external plugin (NES) as proof-of-concept
4. **Phase 4:** Update CLI to auto-discover plugins
5. **Phase 5:** Publish plugin creation guide and template
6. **Phase 6:** Consider making Game Boy an optional plugin in v2.0 (breaking change)

## Security & Safety

- **Trusted plugins only:** Loading arbitrary code should be done only in trusted hosts. CI/test environments should avoid auto-loading untrusted chips.
- **Code review:** Document recommended vetting for third-party chips (code review, minimal API surface, no network access).
- **Sandboxing:** Consider Web Workers or isolated contexts for untrusted plugins (post-v1).
- **Official plugins:** Plugins published under `@beatbax/*` namespace are reviewed and maintained by core team.

## Open Questions

- **Q:** Should plugins be able to extend the language syntax (e.g., SID-specific filter commands)?  
  **A:** Not in v1. Use `inst` parameters for chip-specific features. Language extensions are v2+.

- **Q:** Should plugins include export support (e.g., NSF export for NES)?  
  **A:** Yes, via optional `exportToNative()` method. Each plugin can provide native format export.

- **Q:** How do we handle version compatibility between engine and plugins?  
  **A:** Use `peerDependencies` with semver ranges. Engine validates plugin API version on registration.

- **Q:** Can multiple plugins be active simultaneously?  
  **A:** No, one chip per song (defined by `chip` directive). Future multi-chip songs are out of scope.

- **Q:** How do bundlers handle optional plugins?  
  **A:** Use static registry with conditional imports. Tree-shaking eliminates unused plugins.

## Related Features

- **Monorepo Refactoring:** Required to create separate `packages/plugins/*` structure
- **Dynamic Chip Loading:** Original design doc in `/docs/features/dynamic-chip-loading.md` (merged into this spec)
- **Effects System:** Plugins must support effects like vibrato, portamento if they want full compatibility

## Merged Content from `dynamic-chip-loading.md`

This spec absorbs the original `dynamic-chip-loading.md` proposal, which focused on:
- Runtime module selection (`import()` vs static registry)
- Adapter interface for chip backends  
- Bundler fallback strategies
- Security considerations for third-party chips

All of these concerns are now addressed in the sections above (Dynamic Loading Strategies, Plugin Interface, Security & Safety). The original document is deprecated in favor of this unified plugin system spec.

## References

- [VSCode Extension API](https://code.visualstudio.com/api) - Similar plugin pattern
- [Rollup Plugin API](https://rollupjs.org/plugin-development/) - Clean plugin interface design
- [ESBuild Plugins](https://esbuild.github.io/plugins/) - Lightweight plugin loading
