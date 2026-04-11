---
title: Plugin System for Chip Backends
status: proposed
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/4"
---

## Summary

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

  // Optional: Resolve a named sample asset to an ArrayBuffer.
  // Used by chips with sampled audio channels (e.g. NES DMC, SID samples).
  // The `ref` string follows the same multi-environment conventions as `import`:
  //   - "@<chip>/<name>" — resolve from the plugin's built-in sample library
  //   - "local:<path>"   — resolve from the local file system (CLI/Node.js only)
  //   - "https://..."    — resolve via fetch() (browser and Node.js 18+)
  // Implementations must block "local:" references in browser contexts.
  resolveSampleAsset?(ref: string): Promise<ArrayBuffer>;

  // Optional: Built-in named sample library (for "@<chip>/<name>" references).
  // Keys are sample names; values are base64-encoded .dmc/.raw content.
  bundledSamples?: Record<string, string>;

  // Optional: Convert instrument to native format
  instrumentToNative?(inst: InstrumentDef): any;

  // Optional: Export support (NSF, .ftm, .fms, etc.)
  // May return multiple exports keyed by format name.
  exportToNative?(song: SongModel, format?: string): Uint8Array;
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
- [ ] Create `packages/plugins/chip-nes/` with proper structure (see `docs/features/nes-apu-chip-plugin.md` for full implementation plan)
- [ ] Implement NES APU channels (2 pulse, 1 triangle, 1 noise, 1 DMC)
- [ ] Add NES period tables and frequency mappings (61 MIDI notes, C2–C7)
- [ ] Implement `bundledSamples` for DMC channel built-in library (`@nes/kick`, `@nes/snare`, `@nes/bass_c2`, `@nes/hihat`, `@nes/crash`)
- [ ] Implement `resolveSampleAsset()` supporting `@nes/`, `local:`, and `https://` references
- [ ] Write tests for NES plugin
- [ ] Add example NES songs in `/songs/` (e.g. `wily_fortress.bax`, `kingdom_hall.bax`)

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
- **Sample asset loading:** Plugins that use sampled audio (e.g. `@beatbax/plugin-chip-nes` DMC channel) must follow the same import security model as BeatBax imports (see `docs/language/import-security.md`):
  - `"@<chip>/<name>"` — bundled library (always safe; embedded in plugin package)
  - `"local:<path>"` — file system access; blocked automatically in browser contexts; path-traversal guard applies in Node.js/CLI
  - `"https://..."` — remote fetch; allowed in browser and Node.js 18+; plugins should not load samples from untrusted origins

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

## Web UI Plugin Loading

The web UI ships with all official plugins **pre-bundled** by the Vite build (static imports, fully tree-shakeable). Users toggle them on/off through **Settings → Plugins** and the choice is persisted to `localStorage`. A page reload cleanly re-registers the enabled set.

### Option A: Pre-bundled plugins (current implementation)

Every officially supported plugin is a static import in `apps/web-ui/src/plugins/registry-config.ts`. Vite bundles them at build time; the user toggles render checkboxes and storage state only.

**Adding a new plugin to the web UI:**

```typescript
// apps/web-ui/src/plugins/registry-config.ts
import sidPlugin from '@beatbax/plugin-chip-sid';  // 1. add import

export const AVAILABLE_PLUGINS: PluginEntry[] = [
  { id: 'nes', label: 'NES (Ricoh 2A03)', ... plugin: nesPlugin },
  { id: 'sid', label: 'C64 SID',          ... plugin: sidPlugin }, // 2. add entry
];
```

Then:
```bash
npm install --workspace=apps/web-ui @beatbax/plugin-chip-sid
```

**Pros:** No CSP issues, full tree-shaking, zero network requests at runtime.
**Limitation:** Adding a new plugin requires a code change + rebuild + redeploy.

---

### Option B: CDN dynamic loading (planned — community plugins)

This approach lets users install arbitrary `@beatbax/plugin-chip-*` packages at runtime — no rebuild required. It is **not yet implemented**; this section is the implementation spec.

#### Scope guard (security)

Only `@beatbax/plugin-chip-*` scoped packages are permitted. All other package names are rejected before any network request is made:

```typescript
function assertSafePluginPackage(name: string): void {
  if (!/^@beatbax\/plugin-chip-[a-z0-9-]+$/.test(name)) {
    throw new Error(
      `Unsafe plugin package '${name}'. Only @beatbax/plugin-chip-* packages are allowed.`
    );
  }
}
```

#### CDN loading

Packages are loaded via [esm.sh](https://esm.sh), which converts any npm package to a browser-safe ESM bundle on demand:

```typescript
async function installPluginFromCDN(packageName: string): Promise<void> {
  assertSafePluginPackage(packageName);

  const url = `https://esm.sh/${packageName}`;
  const mod = await import(/* @vite-ignore */ url);
  const plugin = mod.default ?? mod;

  if (typeof plugin?.name !== 'string' || typeof plugin?.createChannel !== 'function') {
    throw new Error(`'${packageName}' does not export a valid ChipPlugin.`);
  }

  chipRegistry.register(plugin);

  // Persist for next reload
  const stored = JSON.parse(localStorage.getItem('beatbax:cdn-plugins') ?? '[]');
  localStorage.setItem(
    'beatbax:cdn-plugins',
    JSON.stringify([...new Set([...stored, packageName])])
  );
}
```

#### Re-loading persisted CDN plugins on startup

```typescript
export async function loadCDNPluginsFromStorage(): Promise<void> {
  const stored: string[] = JSON.parse(
    localStorage.getItem('beatbax:cdn-plugins') ?? '[]'
  );
  for (const pkg of stored) {
    try {
      await installPluginFromCDN(pkg);
    } catch (err) {
      console.warn(`[plugins] Failed to reload '${pkg}' from CDN:`, err);
    }
  }
}
```

Call `loadCDNPluginsFromStorage()` in `main.ts` after `loadPluginsFromStorage()`.

#### CSP requirements

The following CSP header additions are required:

```http
Content-Security-Policy:
  script-src 'self' https://esm.sh;
  connect-src 'self' https://esm.sh https://registry.npmjs.org;
```

#### UI — plugin install panel

The Settings → Plugins section should render a second sub-section ("Community plugins") with:

- A text input for the package name (e.g. `@beatbax/plugin-chip-sid`)
- An "Install" button that calls `installPluginFromCDN()`
- A loading spinner while the CDN import is in flight
- An error message if the package fails to load or fails the scope guard
- A list of already-installed CDN plugins with a "Remove" button that deletes from localStorage and reloads

#### Uninstalling a CDN plugin

Since `chipRegistry` has no `unregister()` method, removal is handled by deleting the entry from storage and reloading:

```typescript
function removeCDNPlugin(packageName: string): void {
  const stored: string[] = JSON.parse(
    localStorage.getItem('beatbax:cdn-plugins') ?? '[]'
  );
  localStorage.setItem(
    'beatbax:cdn-plugins',
    JSON.stringify(stored.filter(p => p !== packageName))
  );
  window.location.reload();
}
```

#### Version pinning

By default, `esm.sh` resolves the latest version. To pin:

```
https://esm.sh/@beatbax/plugin-chip-sid@1.2.3
```

The plugin install UI should expose a version field (optional; defaults to `latest`).

#### Tradeoffs vs Option A

| | Option A (pre-bundled) | Option B (CDN) |
|---|---|---|
| Security | ✅ No external code at runtime | ⚠ Requires CSP allowlist; scope guard mandatory |
| Build requirement | Change + rebuild for new plugin | Zero rebuild |
| Offline support | ✅ Full offline | ❌ Requires esm.sh reachable |
| Tree-shaking | ✅ Vite removes unused code | ❌ Full bundle always loaded |
| Best for | Official plugins | Community / experimental plugins |

---



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
