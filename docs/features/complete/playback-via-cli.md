---
title: Playback via CLI
status: closed
authors: ["kadraman"]
created: 2025-12-14
issue: "https://github.com/kadraman/beatbax/issues/11"
---

## Summary
Allow deterministic playback from the CLI (no browser) using the existing `cli play <file>` command. The CLI must be able to render or stream audio headlessly (Node.js) by providing a WebAudio-compatible AudioContext implementation when no browser is available.

Example user command:
- Windows: npm run cli -- play songs\sample.bax
- Cross-platform: npm run cli -- play "songs/sample.bax"


Currently `cli play` launches a browser UI to obtain a browser AudioContext. For CI, servers, headless environments, and users who prefer pure-CLI operation we must support true headless playback and offline rendering without opening a browser.

## Goals
- Enable real-time and offline playback from Node.js without opening a browser.
- Use a WebAudio-compatible API to keep engine code unchanged (AudioContext semantics preserved).
- Prefer a pure-Node polyfill by default; allow optional native audio output plugin in future.
- Keep scheduling deterministic and reuse existing tick scheduler and chip backends.

## Non-goals
- Provide a full native audio-device abstraction (out-of-scope; can be added later).
- Change core scheduler semantics or ISM format.

## UX / CLI
New or extended flags for `cli play`:
- `--browser` / `-b`: Launch browser-based playback (opens web UI).
- `--no-browser` / `--headless`: Force headless Node playback (default in Node).
- `--backend <name>`: Choose backend (`auto`, `node-webaudio`, `browser`).
- `--sample-rate <hz>` / `-r`: Sample rate for headless context (default 44100).
- `--buffer-frames <n>`: Buffer length in frames for offline rendering (optional).

Examples:
- Headless playback (default): `npm run cli -- play songs\sample.bax`
- Force browser playback: `npm run cli -- play songs\sample.bax --browser`
- Explicit backend: `npm run cli -- play songs\sample.bax --backend node-webaudio`
- Offline render: `npm run cli -- export wav songs\sample.bax out.wav --sample-rate 48000`

## Design
1. Backend selection
   - If a browser AudioContext is present, use it (existing behavior).
   - Otherwise, when `--no-browser` or `--backend node-webaudio` is selected, dynamically import a Node WebAudio polyfill (recommended: standardized-audio-context) and create an AudioContext/OfflineAudioContext.
2. AudioContext factory
   - Add a small factory in src/audio/playback.ts that returns a context usable by engine and Tone.js:
     - Browser: return global AudioContext/webkitAudioContext.
     - Node: dynamic import('standardized-audio-context') and construct AudioContext({ sampleRate }).
3. Integration
   - Ensure Tone or other libs used by engine get the created context (e.g., Tone.context = await createAudioContext()) before creating nodes.
   - Reuse tickScheduler for timing; schedule node creation and AudioParam automation the same as browser path.
4. Realtime output (Node)
   - The polyfilled AudioContext may not route audio to system speakers. Provide:
     - Optional plugin `@beatbax/cli-audio-output` (future) to pipe rendered buffers to node-speaker or similar.
     - For MVP, document that realtime playback may require additional native output plugin; offline render-to-file is fully supported.
5. Offline rendering
   - Use OfflineAudioContext to prerender into a buffer and either:
     - Write to WAV (render-to-file)
     - Stream to native output plugin if available

## Implementation notes
- package.json: add runtime dependency "standardized-audio-context" (or similar) in CLI/package or top-level if shared.
- playback factory (src/audio/playback.ts): dynamic import to avoid bundling the polyfill into browser builds.
- CLI (packages/cli/src/cli.ts): add flags, call createAudioContext({ sampleRate }) early, and set Tone.context when needed.
- Ensure all code paths use the same scheduler and chip apu implementations so behavior is deterministic.

Minimal code sketch (for implementer reference):
```ts
// filepath: c:\Users\kadraman\repos\beatbax\src\audio\playback.ts
// ...existing code...
export async function createAudioContext(opts: { sampleRate?: number } = {}) {
  if (typeof window !== 'undefined' && (globalThis as any).AudioContext) {
    const Ctor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    return new Ctor();
  }
  const { AudioContext } = await import('standardized-audio-context');
  return new AudioContext({ sampleRate: opts.sampleRate ?? 44100 });
}
// ...existing code...
```

## Validation & Tests
- Unit tests:
  - createAudioContext returns an object with AudioContext-like API in Node test env (mock or import polyfill).
  - CLI flag parsing for --no-browser, --backend.
- Integration tests:
  - Offline render of a fixture song produces deterministic WAV matching golden file.
  - Scheduler timing parity between browser and node-webaudio path (compare rendered PCM).
- CI: add an offline-render smoke test that runs headlessly.

## Backward compatibility
- Default behavior remains unchanged when a browser AudioContext is available.
- New flags are additive.

## Security & Packaging
- Dynamically import node polyfills only in Node to avoid increasing browser bundle size.
- Document the dependency and licensing for chosen polyfill.

## TODO
- Add optional native output plugin for realtime streaming in Node (node-speaker / WASAPI).
- Add example CLI recipes and a small tutorial section in docs/demo.
- Update CHANGELOG and release notes after landing.