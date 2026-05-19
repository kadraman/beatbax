---
"@beatbax/cli": patch
"@beatbax/engine": patch
"@beatbax/plugin-chip-nes": patch
---

Improve WAV-to-DMC conversion correctness, validation, and paste-safe output.

- NES DMC encoding:
  - Removed unintended global NES clock-region mutation during encoding.
  - Capped pre-resample and resampled working lengths from maxBytes and rateHz to avoid unnecessary work on long inputs.
  - Reused shared greedy DMC bit-selection logic to remove duplicated encoder logic.
  - Tightened emitted instrument-name sanitization to match identifier rules (no leading digits).
  - Made emitted local sample refs paste-safe by percent-encoding spaces and decoding on load.

- CLI wav2dmc:
  - Fixed -q/--rate alias precedence over defaulted --dmc-rate.
  - Changed --dmc-rate handling to reject invalid, non-integer, or out-of-range values instead of silently clamping/defaulting.
  - Added integration coverage for invalid rate inputs and spaced output paths in --emit-inst output.

- Engine WAV reader:
  - Fixed truncated data-chunk handling to size output by bytes actually present, avoiding silent zero-padded tails.
  - Added focused wavReader truncation regression tests.
