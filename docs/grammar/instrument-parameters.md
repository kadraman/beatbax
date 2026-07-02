# Instrument parameters

Author-facing reference for BeatBax `inst` property naming.

## Naming tiers

| Tier | Rule | Examples |
|------|------|----------|
| **Generic** | Same meaning on every chip that supports it | `type=`, `env=`, `note=`, `gm=`, `pan=` |
| **Generic macros** | FamiTracker-style software envelopes (tick-stepped) | `vol_env=`, `arp_env=`, `pitch_env=`, `duty_env=` |
| **Chip-prefixed** | Hardware-specific or export-format-specific | `gb:width`, `gb:pan`, `gb:uge_note`, `gg:pan`, `nes:noise_period` |
| **Type-scoped unprefixed** | OK when param applies to one `type=` on one chip | `wave=`, `duty=` (GB+NES pulse), `linear=` (NES triangle) |

Parser accepts `chip:key=value` via vendor prefix stripping (e.g. `gb:width=7`).

## Game Boy noise (hUGE-aligned)

Noise pitch/brightness comes from the **pattern-row note**, not instrument-level clock params.

| Param | Meaning |
|-------|---------|
| `gb:width=7` / `15` | LFSR width: 7-bit metallic (snares, toms) vs 15-bit broad (hats, cymbals) |
| `length` | When set, note stops after N/256 seconds (256 Hz hardware length counter), or sooner if the pattern step ends |
| `gb:uge_note=C-7` | hUGETracker display note for named hits (canonical) |
| `uge_note=C-7` | Accepted alias for `gb:uge_note` |
| `env=` | NR42-style volume envelope |
| `length=` | Hardware length counter |

**Removed:** `divisor`, `shift`, `gb:divisor`, `gb:shift` — no hUGETracker equivalent; playback derives NR43 internally from `gb:uge_note`.

Example:

```bax
inst kick  type=noise gb:width=7  env=14,down,1 length=16 gb:uge_note=C-6
inst snare type=noise gb:width=7  env=10,down,2 length=16 gb:uge_note=C-6
inst hat   type=noise gb:width=15 env=4,down,1  length=8  gb:uge_note=C-7
```

See [Game Boy composition guide](../chips/gameboy/composition_guide.md) and [UGE export guide](../exports/uge-export-guide.md).
