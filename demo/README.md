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
