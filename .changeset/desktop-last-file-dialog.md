---
"@beatbax/desktop": patch
---

Remember the last File → Open / Save folder (monorepo internal).

Open no longer always starts in the bundled example-songs directory. Desktop stores the last chosen folder in userData, skips packaged `.app/Contents/` so Open cannot stick inside the bundle, and still uses the examples folder on first launch.
