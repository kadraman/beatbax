/**
 * BeatBax metadata and example song templates for the SMS (SN76489) chip plugin.
 *
 * These are intended as starting points for users to build their own songs, and
 * are not meant to be comprehensive demonstrations of the plugin's capabilities.
 */

export const CHIP_IMAGE_BASE64 =
'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';

export const smsSongWizard = {
    metadata: {
      chipDisplayName: 'SMS (SN76489)',
      platform: 'Sega Master System / Game Gear',
      year: '1985',
      channelSummary: '3 tone, 1 noise',
      image: CHIP_IMAGE_BASE64,
    },
    templates: {
      instruments: [
        {
          id: 'sms-sample-instruments',
          label: 'Sample instruments',
          content:
`
inst lead type=tone1 vol=0 gm=81
inst arp  type=tone2 vol=0 vol_env=[0,2,4,6,8,10,12,14,15] gm=84
inst bass type=tone3 vol=0 vol_env=[0,6,10,14,15] gm=39

inst snare  type=noise noise_mode=white noise_rate=1 vol_env=[1,4,7,10,12,14,15] noise_rate_env=[0,0,1,1,2]
inst hihat  type=noise noise_mode=white noise_rate=0 vol_env=[6,11,14,15]
inst shaker type=noise noise_mode=periodic noise_rate=1 vol_env=[4,8,12,15]
`,
        },
      ],
      effects: [
        {
          id: 'sms-sample-fx',
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
          id: 'sms-sample-structure',
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
        instruments: 'sms-sample-instruments',
        effects: 'sms-sample-fx',
        structure: 'sms-sample-structure',
      },
    },
  };
