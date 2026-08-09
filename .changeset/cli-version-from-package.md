---
"@beatbax/cli": patch
---

Fix `beatbax --version` reporting a hardcoded `0.1.0` instead of the published package version.

- Read the version from `src/version.ts` (kept in sync with `package.json`).
- Add a unit test so the CLI version string cannot drift from `package.json` again.
