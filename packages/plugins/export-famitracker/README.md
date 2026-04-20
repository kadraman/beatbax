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

## Macro verification songs

Small NES fixtures for validating FamiTracker export coverage are available in:

- `songs/features/famitracker/nes_macro_vol_env_loop.bax`
- `songs/features/famitracker/nes_macro_pitch_env.bax`
- `songs/features/famitracker/nes_macro_arp_triangle.bax`
- `songs/features/famitracker/nes_macro_duty_env.bax`
- `songs/features/famitracker/nes_macro_noise_vol_env_oneshot.bax`

Example:

```bash
node bin/beatbax export famitracker-text songs/features/famitracker/nes_macro_pitch_env.bax /tmp/nes_macro_pitch_env.txt
```
