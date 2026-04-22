# @beatbax/plugin-exporter-famitracker

Standalone FamiTracker exporter plugin package for BeatBax.

Exports one NES-only exporter plugin:

- `famitracker-text` → text `.txt`

```ts
import { exporterRegistry } from '@beatbax/engine';
import famitrackerExporterPlugins from '@beatbax/plugin-exporter-famitracker';

for (const plugin of famitrackerExporterPlugins) {
  if (!exporterRegistry.has(plugin.id)) exporterRegistry.register(plugin);
}
```

## Export verification songs

Small NES fixtures for validating FamiTracker export coverage are available in:

- `songs/features/nes/nes_macro_vol_env_loop.bax`
- `songs/features/nes/nes_macro_pitch_env.bax`
- `songs/features/nes/nes_macro_arp_triangle.bax`
- `songs/features/nes/nes_macro_duty_env.bax`
- `songs/features/nes/nes_macro_noise_vol_env_oneshot.bax`
- `songs/features/nes/nes_synth_channels.bax`
- `songs/features/nes/nes_dpcm_channel.bax`
- `songs/features/nes/nes_effects_demo.bax`

Example:

```bash
node bin/beatbax export famitracker-text songs/features/famitracker/nes_macro_pitch_env.bax /tmp/nes_macro_pitch_env.txt
```
