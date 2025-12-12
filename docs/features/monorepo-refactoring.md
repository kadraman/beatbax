---
title: Monorepo Refactoring
status: proposed
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/9"
---

## Summary

Restructure the BeatBax project into a monorepo architecture that separates concerns and enables independent versioning, testing, and deployment of different components. The core engine will become a reusable npm module consumed by multiple frontend applications and tools.

## Motivation

- **Separation of concerns**: Engine logic, UI implementations, and tooling should be independently maintainable
- **Reusability**: Other projects should be able to consume `beatbax-engine` without bundling UI code
- **Independent deployment**: Web UI, Electron app, and CLI can be versioned and released separately
- **Plugin ecosystem**: Clear boundaries enable third-party plugin development
- **Team scalability**: Different teams/contributors can work on different packages without conflicts
- **Build optimization**: Only rebuild changed packages instead of entire project

## Current Structure Issues

- Engine code (`src/`) is mixed with CLI code
- Demo (`demo/`) is a separate directory but shares dependencies
- No clear plugin system or extension points
- Single `package.json` with all dependencies (dev + prod + UI)
- Difficult to consume BeatBax engine in external projects without pulling in CLI/demo code
- Applications (web-ui, future electron-ui) would be publishable packages when they should be private applications

## Proposed Structure

```
beatbax/                          # Monorepo root
├── package.json                  # Root workspace config
├── turbo.json                    # Turborepo config (optional)
├── .github/
│   └── workflows/
│       ├── ci.yml                # Test all packages
│       ├── publish-engine.yml    # Publish engine to npm
│       ├── publish-cli.yml       # Publish CLI to npm
│       └── deploy-web-ui.yml     # Deploy web UI to hosting
├── packages/
│   ├── engine/                   # @beatbax/engine (npm package)
│   │   ├── package.json          # Published to npm
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   ├── chips/
│   │   │   ├── scheduler/
│   │   │   ├── audio/
│   │   │   ├── export/
│   │   │   ├── import/
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── README.md
│   │
│   ├── cli/                      # @beatbax/cli (npm package)
│   │   ├── package.json          # Published to npm with bin
│   │   ├── src/
│   │   │   ├── cli.ts
│   │   │   ├── cli-dev.ts
│   │   │   └── cli-uge-inspect.ts
│   │   ├── bin/
│   │   │   └── beatbax.js
│   │   └── README.md
│   │
│   └── plugins/                  # Plugin system (npm packages)
│       ├── chip-nes/            # @beatbax/plugin-chip-nes
│       ├── chip-sid/            # @beatbax/plugin-chip-sid
│       └── chip-genesis/        # @beatbax/plugin-chip-genesis
│
├── apps/
│   ├── web-ui/                   # Web application (NOT published to npm)
│   │   ├── package.json          # private: true
│   │   ├── src/
│   │   │   ├── boot.ts
│   │   │   ├── components/
│   │   │   └── styles/
│   │   ├── public/
│   │   │   └── index.html
│   │   ├── songs/
│   │   ├── vite.config.ts        # or esbuild config
│   │   └── README.md
│   │
│   └── electron-ui/              # Desktop application (NOT published to npm)
│       ├── package.json          # private: true
│       ├── src/
│       │   ├── main/            # Electron main process
│       │   └── renderer/        # Electron renderer
│       ├── electron-builder.yml # Packaging config
│       └── README.md
│
├── docs/                         # Shared documentation
├── examples/                     # Usage examples
└── README.md                     # Main project README
```

## Package Responsibilities

### `@beatbax/engine` (Core Engine)

**Responsibilities:**
- Language parsing (tokenizer, parser, AST)
- Pattern and sequence expansion
- Song resolution and ISM generation
- Chip backends (Game Boy, future chips)
- Audio scheduling and playback primitives
- Export formats (JSON, MIDI, UGE)
- Import formats (UGE reader)

**Exports:**
```typescript
// Main exports
export { parse, tokenize } from './parser';
export { resolveSong } from './song/resolver';
export { Player } from './audio/playback';
export { exportJSON, exportMIDI, exportUGE } from './export';
export { readUGEFile, parseUGE } from './import';

// Type exports
export type { AST, PatternNode, InstrumentNode } from './parser/ast';
export type { Song, Channel, Event } from './song/songModel';
```

**Dependencies:** Zero runtime dependencies (keeps bundle small)

**Peer dependencies:** None (can run in Node, browser, Electron)

### `@beatbax/cli` (Command-Line Interface)

**Responsibilities:**
- CLI argument parsing and validation
- File I/O operations
- Command implementations (play, verify, export, inspect)
- Terminal output formatting
- Development mode tooling

**Dependencies:**
- `@beatbax/engine` (workspace reference)
- `commander` (CLI framework)
- Node.js built-ins (`fs`, `path`)

**Bin entry:** `beatbax` command globally installable via npm

### `apps/web-ui` (Browser Demo/Editor - Application)

**Responsibilities:**
- Interactive code editor with syntax highlighting
- Real-time playback controls
- Channel mute/solo UI
- Visual feedback (waveforms, event indicators)
- Help documentation rendering
- File loading and example selection

**Dependencies:**
- `@beatbax/engine` (workspace reference)
- Build tooling (vite, esbuild, or similar)
- Optional: CodeMirror or Monaco for editor
- Optional: marked for markdown rendering

**Deployment:** Static site (GitHub Pages, Netlify, Vercel)

**Package.json:**
```json
{
  "name": "beatbax-web-ui",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### `apps/electron-ui` (Desktop Application - Future)

**Responsibilities:**
- Native desktop application wrapper
- File system integration (open/save dialogs)
- Menu bar and keyboard shortcuts
- Native audio routing options
- Project management (multi-file songs)
- Packaging for Windows/macOS/Linux

**Dependencies:**
- `@beatbax/engine` (workspace reference)
- `electron`
- `electron-builder` (for packaging)
- Optionally reuses web-ui components

**Deployment:** Distributed as native installers (.exe, .dmg, .AppImage)

**Package.json:**
```json
{
  "name": "beatbax-electron",
  "private": true,
  "version": "1.0.0",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "electron .",
    "build": "tsc && electron-builder",
    "pack": "electron-builder --dir"
  }
}
```

### `@beatbax/plugins/*` (Plugin Packages - Future)

**Responsibilities:**
- Implement chip-specific audio backends
- Follow engine's chip plugin API (from `dynamic-chip-loading.md`)
- Provide instrument definitions and export capabilities per chip

**Dependencies:**
- `@beatbax/engine` (peer dependency for types)

## Migration Strategy

### Phase 1: Create Monorepo Structure (Week 1)

1. **Initialize workspace:**
   ```bash
   # Choose workspace tool: npm workspaces, yarn workspaces, or pnpm
   # Recommended: npm workspaces (built-in, zero config)
   ```

2. **Create `packages/engine/`:**
   - Move `src/` → `packages/engine/src/`
   - Move `tests/` → `packages/engine/tests/`
   - Create new `packages/engine/package.json`:
     ```json
     {
       "name": "@beatbax/engine",
       "version": "0.2.0",
       "type": "module",
       "main": "./dist/index.js",
       "types": "./dist/index.d.ts",
       "exports": {
         ".": "./dist/index.js",
         "./parser": "./dist/parser/index.js",
         "./scheduler": "./dist/scheduler/index.js",
         "./audio/playback": "./dist/audio/playback.js",
         "./export": "./dist/export/index.js",
         "./import": "./dist/import/index.js"
       }
     }
     ```

3. **Create `packages/cli/`:**
   - Move CLI files from `src/cli*.ts` → `packages/cli/src/`
   - Create `packages/cli/package.json` with dependency on `@beatbax/engine`
   - Update imports to use `@beatbax/engine` instead of relative paths

3. **Create `apps/web-ui/`:**
   - Move `demo/` → `apps/web-ui/`
   - Update imports to use `@beatbax/engine`
   - Keep build configuration (vite, esbuild, etc.)
   - Add `"private": true` to prevent accidental npm publish

5. **Update root `package.json`:**
   ```json
   {
     "name": "beatbax-monorepo",
     "private": true,
     "workspaces": [
       "packages/*",
       "apps/*"
     ],
     "scripts": {
       "build": "npm run build --workspaces --if-present",
       "test": "npm run test --workspaces --if-present",
       "dev:engine": "npm run dev -w @beatbax/engine",
       "dev:web": "npm run dev -w beatbax-web-ui",
       "dev:electron": "npm run dev -w beatbax-electron",
       "publish:engine": "npm publish -w @beatbax/engine",
       "publish:cli": "npm publish -w @beatbax/cli"
     }
   }
   ```

### Phase 2: Publish Engine (Week 2)

1. **Verify engine builds independently:**
   ```bash
   cd packages/engine
   npm run build
   npm test
   ```

2. **Test engine consumption:**
   - Create a test project that imports `@beatbax/engine`
   - Verify all exports work correctly
   - Check bundle size (should be minimal)

3. **Publish to npm:**
   ```bash
   npm publish --workspace @beatbax/engine --access public
   ```

4. **Update CLI and web-ui to use published engine** (or continue using workspace references)

### Phase 3: Independent Deployments (Week 3)

1. **Set up separate CI/CD workflows:**
   - Engine: publish to npm on version tag
   - CLI: publish to npm with `bin` entry
   - Web UI: deploy to GitHub Pages or hosting service

2. **Configure Turborepo (optional):**
   - Faster builds with intelligent caching
   - Parallel task execution
   - Remote caching for teams

3. **Documentation updates:**
   - Update main README with monorepo structure
   - Create per-package READMEs
   - Document cross-package development workflow

### Phase 4: Electron App (Future)

1. Create `apps/electron-ui/` (not a publishable package)
2. Set up Electron main/renderer processes
3. Reuse web-ui components where possible
4. Configure electron-builder for native packaging
5. Package for Windows/macOS/Linux distribution

## Benefits

### For Engine Consumers

```typescript
// Clean, focused imports
import { parse, Player, exportMIDI } from '@beatbax/engine';

// Use in any JavaScript project
const ast = parse(songSource);
const player = new Player(audioContext);
await player.playAST(ast);
```

### For BeatBax Developers

```bash
# Install all dependencies
npm install

# Build everything
npm run build

# Test everything
npm test

# Work on engine only
npm run dev -w @beatbax/engine

# Work on web UI with engine hot-reload
npm run dev -w @beatbax/engine & npm run dev -w @beatbax/web-ui
```

### For Plugin Authors

```typescript
// packages/plugins/chip-nes/src/index.ts
import type { ChipBackend } from '@beatbax/engine/types';

export const nes: ChipBackend = {
  channelCount: 5,
  createChannels(ctx) { /* ... */ },
  noteNameToMidi(note, oct) { /* ... */ },
  midiToFreq(midi) { /* ... */ }
};
```

## Breaking Changes

### For Users

- **Engine**: npm package name changes from `beatbax` → `@beatbax/engine`
- **CLI**: May need to reinstall as `@beatbax/cli` or update global install
- **Import paths**: Update if using direct file imports

### Migration Guide for Existing Code

```typescript
// Before
import { parse } from 'beatbax';
import { Player } from 'beatbax/audio/playback';

// After
import { parse } from '@beatbax/engine';
import { Player } from '@beatbax/engine/audio/playback';
// OR (if using main export)
import { parse, Player } from '@beatbax/engine';
```

## Implementation Checklist

- [X] Create monorepo root `package.json` with workspaces
- [X] Move source to `packages/engine/`
- [X] Move CLI to `packages/cli/`
- [ ] Move demo to `packages/web-ui/`
- [X] Update all import paths
- [ ] Configure build scripts for each package
- [X] Update TypeScript configs (references)
- [X] Verify all tests pass in new structure
- [X] Update CI/CD workflows
- [ ] Publish `@beatbax/engine` to npm
- [X] Update documentation
- [ ] Create migration guide for users
- [ ] Set up inter-package linking (workspace references)
- [ ] Configure Turborepo or Nx (optional)
- [ ] Create `packages/electron-ui/` scaffold (future)

## Testing Strategy

1. **Engine tests:** Run in isolation, no UI dependencies
2. **CLI tests:** Mock engine or use workspace reference
3. **Web UI tests:** E2E tests with real engine
4. **Integration tests:** Test cross-package interactions
5. **Smoke tests:** Verify published packages work in fresh project

## Documentation Updates Required

- [ ] Update main README.md with new structure
- [ ] Create `packages/engine/README.md` (npm package docs)
- [ ] Create `packages/cli/README.md` (CLI usage)
- [ ] Create `packages/web-ui/README.md` (web deployment)
- [ ] Update CONTRIBUTING.md with monorepo workflow
- [ ] Update `.github/copilot-instructions.md`
- [ ] Create migration guide for v0.1.x → v0.2.x users

## Risks & Mitigations

**Risk:** Breaking existing users  
**Mitigation:** Publish as major version bump (0.1.x → 0.2.0), provide migration guide

**Risk:** Increased complexity for contributors  
**Mitigation:** Comprehensive docs, simplified npm scripts at root level

**Risk:** Build time increases  
**Mitigation:** Use Turborepo for caching, parallel builds

**Risk:** Import path confusion  
**Mitigation:** Re-export everything from main `@beatbax/engine` entry point

## Success Metrics

- ✅ Engine package size < 200KB (minified)
- ✅ Zero runtime dependencies in engine
- ✅ All tests pass in new structure
- ✅ Independent package versioning works
- ✅ External project can consume `@beatbax/engine` successfully
- ✅ CI build time improves or stays same
- ✅ Developer experience improves (faster iteration)

## See Also

- [dynamic-chip-loading.md](./dynamic-chip-loading.md) - Plugin system design for chip backends
- [../../DEVNOTES.md](../../DEVNOTES.md) - Current architecture notes
- [../../CONTRIBUTING.md](../../CONTRIBUTING.md) - Contribution workflow (to be updated)
