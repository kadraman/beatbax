---
title: CLI export audio (.bax -> .wav)
status: closed
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/7"
---

**Summary**

Add a new CLI feature to export a `.bax` (BeatBax script) or exported ISM JSON into a rendered audio file (WAV). The command will render the song deterministically using the engine's offline renderer and write a PCM WAV file suitable for playback on any standard player.

**Goals**

- Add `export wav <input> <output>` to the CLI with options for sample rate, bit depth, channels, and render length.
- Use engine's buffered/offline renderer to produce deterministic PCM samples.
- Provide a small, dependency-free WAV writer utility in the engine export module for Node usage.
- Add integration tests to validate WAV header fields and a short smoke test of generated audio content.
- Add documentation and example usage to `TUTORIAL.md`.

**CLI UX**

- Basic usage:

  npm run cli -- export wav song.bax song.wav

- Flags:

  --sample-rate, -r  Number (default: 44100)
  --bit-depth, -b    Number (16|24|32, default: 16)
  --channels, -c     Number (1|2, default: 1)
  --duration, -d     Seconds to render (optional; default: full song length)
  --normalize        Boolean (optional; normalize peak to 0.95)

Examples:

  npm run cli -- export wav demo.bax demo.wav --sample-rate 48000 --bit-depth 24

**Implementation notes**

- Rendering:
  - Reuse `engine/audio/pcmRenderer.ts` to render deterministic Float32 PCM frames.
  - Ensure the renderer accepts target sample rate and channel count parameters and returns a Float32Array (interleaved for stereo).

- WAV writer:
  - Implement `engine/export/wavWriter.ts` which accepts sample rate, bit depth, channels, and Float32Array and produces a Node `Buffer` with a correct RIFF/WAVE header and PCM data (support PCM16/PCM24/PCM32).
  - Keep implementation small and dependency-free. Write simple sample conversion (float -> int) and little-endian framing.

- CLI wiring:
  - Integrated into `packages/cli/src/cli.ts` under the `export` command:
    1. Loads/parses the input `.bax` using existing parser/resolver.
    2. Uses the engine's sequence/song resolver to produce an ISM.
    3. Calls the `pcmRenderer` to render the full song (or the requested duration) to Float32 PCM.
    4. Optionally normalizes the buffer if `--normalize` is set.
    5. Uses `wavWriter` to convert to Buffer and writes to disk.

**Error handling & validations**

- Validate input file exists and is a supported format (`.bax` or `.json` ISM).
- Validate sample rate and bit depth options; fail fast with helpful messages.
- If the rendering exceeds memory thresholds for very long songs, provide a warning and recommend streaming/segment-rendering (future work).

**Tests**

- Add an integration test `packages/cli/tests/export-audio.integration.test.ts` that:
- Runs the CLI export command for a short included demo (1-4 seconds).
  - Verifies the produced file exists and reads the WAV header to confirm sample rate, channels, and PCM format.
  - Optionally read a small chunk of PCM samples and check they are not all zero.

- Add unit tests for `wavWriter` to assert correct header bytes for known inputs.

**CI considerations**

- Run the audio export tests on GitHub Actions Linux runners. Add a small job dependency so audio export tests run after the engine build.
- Keep the test audio short to avoid long CI times.

**Acceptance criteria**

- `npm run cli -- export audio demo.bax demo.wav` produces a valid WAV file that plays in a media player.
- Tests validate the WAV header and non-empty audio content.
- CLI flags `--sample-rate`, `--bit-depth`, `--channels` work as documented.

**Future improvements**

- Streaming WAV output for very long renders to avoid keeping the whole buffer in memory.
- Add MP3/FLAC export via optional dependencies (LAME, flac encoder) behind feature flags.
- Allow exporting multiple songs as a batch.

---

I can implement the `wavWriter` and the CLI handler now and add the integration test — which would complete items 2–4 in the todo list. Which step should I do next? 
