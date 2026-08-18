---
"@beatbax/engine": patch
---

Keep Game Boy pulse preview on the bandlimited oscillator when an instrument subpattern only uses 1xx/2xx pitch slides.

Baking those notes as raw squares made held pulse instruments with a pitch table sound shrill in the editor compared to the same duty without a table. Duty and volume programs still bake to a buffer; 1xx/2xx now ride the oscillator so preview matches the dry timbre.
