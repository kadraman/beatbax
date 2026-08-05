---
"@beatbax/cli": patch
---

Fix the global `beatbax` binary by emitting a Node shebang on `dist/cli.js`, so `npm install -g @beatbax/cli` installs an executable that runs under Node instead of the shell.
