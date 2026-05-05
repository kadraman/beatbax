# @beatbax/plugin-exporter-vgm

## 0.1.0

### Minor Changes

- dc5c6ab: new package

  Implements a VGM (Video Game Music) exporter plugin for BeatBax SMS/Game Gear songs using the SN76489 PSG chip.
  - Converts validated ISM to a standards-compliant VGM v1.51 file
  - Supports all four SN76489 channels: three tone channels and the noise channel
  - Exports volume, frequency, noise mode, and noise rate data
  - Supports effects: `vol_env`, `noise_rate_env`, `gg_stereo` (Game Gear stereo panning via `0x4F` writes)
  - Includes GD3 metadata tag generation
  - Produces files compatible with VGMPlay and similar players
  - Registered as a plugin via the BeatBax plugin architecture; does not modify core
