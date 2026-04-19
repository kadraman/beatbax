# @beatbax/plugin-exporter-famitracker

Standalone FamiTracker exporter plugin package for BeatBax.

Exports two NES-only placeholder exporter plugins:

- `famitracker` → binary-style `.ftm`
- `famitracker-text` → text `.txt`

```ts
import { exporterRegistry } from '@beatbax/engine';
import famitrackerExporterPlugins from '@beatbax/plugin-exporter-famitracker';

for (const plugin of famitrackerExporterPlugins) {
  if (!exporterRegistry.has(plugin.id)) exporterRegistry.register(plugin);
}
```
