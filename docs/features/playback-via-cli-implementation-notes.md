# Playback via CLI - Implementation Notes

## Status: Implemented

### Implemented
- ✅ CLI flags added: `--no-browser`, `--backend`, `--sample-rate`, `--render-to`, `--duration`
- ✅ `createAudioContext()` factory function in playback.ts with dynamic import support
- ✅ `PlayOptions` interface for typed options
- ✅ WAV file writing helper functions
- ✅ Option parsing and validation in CLI
- ✅ standardized-audio-context dependency added to both CLI and engine packages
- ✅ Appropriate error messages and documentation of limitations

### Current Limitations
The feature infrastructure is complete, but functional headless audio requires native bindings:

1. **Real-time headless playback** (`--no-browser`):
   - Requires native audio output (e.g., node-speaker, WASAPI bindings)
   - `standardized-audio-context` is a wrapper/polyfill, not a full implementation
   - Cannot output to system audio in pure Node.js

2. **Offline WAV rendering** (`--render-to`):
   - Requires native OfflineAudioContext implementation
   - `standardized-audio-context` expects a native context to wrap
   - Consider alternatives: `web-audio-api` (unmaintained), custom PCM rendering

### Why standardized-audio-context Doesn't Suffice
```
Error: Missing the native OfflineAudioContext constructor.
```
This error occurs because `standardized-audio-context` is designed to normalize behavior across different browser AudioContext implementations. It requires a native implementation to wrap. In Node.js environments without native audio bindings, there is no native context to wrap.

### Future Work

#### Option 1: Use web-audio-api (native C++ addon)
- Package: `web-audio-api` (last updated 2019, may be unmaintained)
- Provides native AudioContext and OfflineAudioContext for Node.js
- Requires native compilation (node-gyp, Python, C++ toolchain)
- Installation: `npm install web-audio-api`

#### Option 2: Custom PCM Renderer
- Implement a simple PCM renderer that doesn't use WebAudio at all
- Directly generate PCM samples from chip emulation
- Write WAV files from raw PCM data
- Pros: No native dependencies, full control
- Cons: Bypasses existing WebAudio-based chip implementations

#### Option 3: Hybrid Approach
- Keep browser-based playback as primary
- For CLI WAV export, pre-render in a headless browser (Puppeteer)
- Or document the limitation and recommend external tools

### Testing
All CLI flags parse correctly and provide helpful error messages:
```bash
# Check help
node packages/cli/dist/cli.js play --help

# Test flags (will show limitation message)
node packages/cli/dist/cli.js play songs/sample.bax --render-to output.wav
node packages/cli/dist/cli.js play songs/sample.bax --no-browser
```

### Recommendation
For MVP completion, document the current state and plan native audio support as a post-MVP enhancement. The infrastructure is in place; only the native audio backend needs to be added.

Consider creating a follow-up feature document: `native-audio-backend.md`
