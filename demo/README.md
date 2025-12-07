# BeatBax Browser Demo

This demo lets you paste or load a `.bax` file in the browser and play it using a simplified Player implementation based on the project's WebAudio playback.

Usage:

1. Serve the `demo/` directory with a local static server (browsers block file:// fetches).
   Example using Node's `http-server` (install if needed):

```powershell
npx http-server demo -p 8080
# then open http://localhost:8080 in your browser
```

Or with Python:

```powershell
python -m http.server 8080 --directory demo
```

2. Open the demo page in your browser and either paste a `.bax` file into the textarea or click "Load example-valid.bax" (the demo expects the repository layout and will attempt to fetch `../songs/example-valid.bax`).

Notes:
- The demo parser is intentionally minimal and for demonstration only.
- Playback uses the browser WebAudio API; playback won't function in Node.
- Stop is not implemented in this simple demo; refresh the page to reset audio context.
 - The demo supports the `chip` directive to select the audio backend. The default
    is `gameboy`. Example at the top of `songs/sample.bax`:

```text
chip gameboy
```

 - Envelopes: the language supports Game Boy-style envelopes using the `gb:`
    prefix or the three-token form `initial,direction,period` (preferred).
    Example: `env=gb:12,down,1` sets initial volume 12 (0..15), direction `down`,
    and period `1` (frame ticks).

 - Help panel: click the ❔ icon or the Show Help button in the demo UI to
    surface the commented guidance in `songs/sample.bax` which now includes
    `chip` and `gb:` envelope examples.
