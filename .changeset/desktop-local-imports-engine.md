---
"@beatbax/engine": patch
---

Allow Desktop (browser-bundled) songs to load `local:` instrument imports.

The browser import resolver previously always rejected `local:` for security. Desktop has Electron file IPC, so the resolver now accepts injected `readFile`/`fileExists` (or `window.electronAPI`) and resolves paths relative to the saved `.bax` file, with the same traversal and absolute-path checks as the CLI. Web-lite clients without a filesystem still block local imports.
