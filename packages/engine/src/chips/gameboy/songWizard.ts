/**
 * BeatBax metadata and example song templates for the NES (Ricoh 2A03) chip plugin.
 *
 * These are intended as starting points for users to build their own songs, and
 * are not meant to be comprehensive demonstrations of the plugin's capabilities.
 */

export const CHIP_IMAGE_BASE64 =
  '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';

export const gbSongWizard = {
    metadata: {
      chipDisplayName: 'Game Boy (DMG-01)',
      platform: 'Nintendo Game Boy',
      year: '1989',
      channelSummary: '2 pulse, 1 wave, 1 noise',
      image: `data:image/png;base64,${CHIP_IMAGE_BASE64}`,
    },
    // we could add more templates here, but this one is already pretty comprehensive and demonstrates a wide range of the plugin's capabilities
    templates: {
      instruments: [
        {
          id: 'gb-sample-instruments',
          label: 'Sample instruments',
          content:
`
inst lead type=pulse1 duty=60 env={"level":12,"direction":"flat","period":1,"format":"gb"} gm=81
inst arp  type=pulse2 duty=25 env={"level":9,"direction":"down","period":2,"format":"gb"} gm=84
inst bass type=wave wave=[0,5,11,15,15,15,15,15,11,5,0,0,0,0,0,0,0,0,6,8,8,8,8,8,8,8,8,6,0,0,0,0] gm=39

inst snare  type=noise env={"level":12,"direction":"down","period":1,"format":"gb"}
inst hihat  type=noise env={"level":5,"direction":"down","period":1,"format":"gb"}
inst shaker type=noise gb:width=7 env={"level":4,"direction":"down","period":1,"format":"gb"} length=4
`,
        },
      ],
      effects: [
        {
          id: 'gb-sample-fx',
          label: 'Sample effects',
          content:
`
effect exprVib  = vib:3,5,sine,4    # medium vibrato — expressiveness on peaks
effect deepVib  = vib:5,3,sine,6    # slow, deep vibrato — atmospheric bridge tension
effect fastVib  = vib:2,8,sine,2    # fast shimmer — blazing climax and peak notes

effect minorArp = arp:3,7           # minor triad  (Am, Dm: root + min3 + P5)
effect majArp   = arp:4,7           # major triad  (F, G: root + maj3 + P5)
effect dom7Arp  = arp:4,7,10        # dominant 7th (E7: root + maj3 + P5 + min7)

effect slide    = port:4            # snappy slide — scalar run articulation
`
        },
      ],
      structure: [
        {
          id: 'gb-sample-structure',
          label: 'Sample structure',
          content:
`
pat melody_pat      = (C5 C5 G5<fastVib>:4 G5 A5 G5<exprVib>:4) (C3:2 .) * 4
pat melody_alt_pat  = (E5 E5 G5<fastVib>:4 F5 E5 C5<slide>:4)
pat bass_pat        = (C3 . C3 . ) * 2 (C3 . . .) * 2  (G2 . . .) * 2
pat arp_pat         = C4<majArp>:4 E4<majArp>:4 G4<majArp>:4 C5<majArp>:4
pat drums_pat       = (snare . . .) (snare . . .) (snare . . .)
pat drums_alt_pat   = (snare . . .) * 2 (shaker hihat) * 8

seq lead_seq        = melody_pat melody_alt_pat
seq bass_seq        = bass_pat
seq arp_seq         = arp_pat * 2
seq drums_seq       = drums_pat drums_alt_pat

channel 1 => inst lead  seq lead_seq
channel 2 => inst arp   seq arp_seq
channel 3 => inst bass  seq bass_seq
channel 4 => inst hihat seq drums_seq

play
`
        },
      ],
      defaults: {
        instruments: 'gb-sample-instruments',
        effects: 'gb-sample-fx',
        structure: 'gb-sample-structure',
      },
    },
  };
