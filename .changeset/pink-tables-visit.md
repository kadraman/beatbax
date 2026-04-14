---
"@beatbax/engine": minor
---

Introduced the chip plugin system: new `ChipPlugin` and `ChipChannelBackend` interfaces for third-party chip backends; a global `ChipRegistry` singleton for runtime registration and lookup; the built-in Game Boy APU extracted into a proper `ChipPlugin`; UI contribution hooks for plugin-driven web UI; new `plugin-api.ts` entry point (Jest-safe, no `import.meta`) exporting only the types and objects external plugins need; optional `setFrequency()` method on channel backends for mid-note frequency changes; optional `createPlaybackNodes()` method for full WebAudio effects support on melodic channels.
