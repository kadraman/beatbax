# C64 SID Composition Guide

This guide focuses on practical arrangement for the Commodore 64 SID target in BeatBax.

## Core Constraints

- Three voices only.
- One shared filter.
- One shared master volume.
- Sync and ring modulation depend on other oscillators.
- 6581 and 8580 are different targets, not cosmetic skins.

These constraints should shape arrangement decisions from the start.

## Practical Voice Strategy

Common role split:

- Voice 1: lead melody or hook
- Voice 2: harmony, arp, or counterline
- Voice 3: bass or special effect voice

Because there are only three voices, large chords should usually be implied via arpeggios, fast movement, or filter contrast rather than literal simultaneity.

## Waveform Choices

Good starting assumptions:

- Triangle: softer basses or supportive lines
- Saw: brighter lead or aggressive bass timbres
- Pulse: classic SID lead and bass work, especially with pulse-width motion
- Noise: percussion, transient layers, and special effects

Choose the simplest waveform that fits the phrase before layering sync/ring or filter automation on top.

## Pulse-Width Writing

Pulse width is one of the fastest ways to make a line sound distinctly SID-like.

Practical guidance:

- use pulse width on sustained leads and basses
- keep fast pulse-width motion musically intentional rather than constant by default
- document whether the intended sound is 6581-flavored or 8580-flavored when sharing examples

## Shared Filter Workflow

Because the filter is shared, think in phrases rather than isolated channels.

Good uses:

- one lead plus one bass sharing a sweep
- temporarily routing only one voice into the filter for contrast
- building section-level tonal change with a common cutoff move

Bad assumptions:

- independent per-voice filter sweeps at the same time
- one voice demanding low-pass while another demands high-pass on the same tick

If two simultaneous parts need different filter stories, separate them in time or route only one of them through the filter.

## Sync and Ring Modulation

Treat sync and ring modulation as arrangement features, not generic ornament switches.

Practical guidance:

- decide which voice is the carrier and which is the source
- keep the relationship stable long enough to be audible
- avoid writing sync/ring phrases as if the voices were independent instruments

In BeatBax, missing or incompatible source relationships should be treated as diagnostics, not silently approximated.

## Model-Aware Writing

When a phrase depends heavily on filter color, pulse-width character, or aggressive timbral movement:

- choose `chipModel` intentionally
- verify the phrase under that model during preview
- avoid assuming the same patch will feel identical on 6581 and 8580

Use contrast demos to document where model choice matters most.

## Export Intent

For SID-targeted BeatBax songs, separate two goals clearly:

- PSID/RSID export for playback/distribution
- GoatTracker-style export for native C64 tracker/homebrew workflows

Rendered WAV/OGG is a preview artifact. It is not the canonical hardware-facing representation.