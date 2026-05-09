/**
 * BeatBax metadata and example song templates for the NES (Ricoh 2A03) chip plugin.
 *
 * These are intended as starting points for users to build their own songs, and
 * are not meant to be comprehensive demonstrations of the plugin's capabilities.
 */

export const CHIP_IMAGE_BASE64 =
 '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';

export const nesSongWizard = {
    metadata: {
      chipDisplayName: 'NES (Ricoh 2A03)',
      platform: 'Nintendo Entertainment System',
      year: '1983',
      channelSummary: '2 pulse, 1 triangle, 1 noise, 1 DMC',
      image: CHIP_IMAGE_BASE64,
    },
    templates: {
      instruments: [
        {
          id: 'nes-sample-instruments',
          label: 'Sample instruments',
          content:
`
inst lead  type=pulse1 duty=25 vol=10 pitch_env=[2,1,0,0,0,0,0,0] gm=81
inst arp   type=pulse2 duty=50 vol_env=[15,15,14,12,10,8,7,6,6,5,5,4,4,3,3,2] gm=84
inst bass  type=triangle linear=96 pitch_env=[1,0,0,0,0,0,0,0] gm=39

inst snare  type=dmc dmc_rate=15 dmc_loop=false dmc_sample="@nes/snare"
inst hihat  type=noise noise_mode=normal noise_period=2 vol_env=[7,4,2,1] note=C5
inst shaker type=dmc dmc_rate=15 dmc_loop=false dmc_sample="@nes/clap"
`,
        },
      ],
      effects: [
        {
          id: 'nes-sample-fx',
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
          id: 'nes-sample-structure',
          label: 'Sample structure',
          content:
`
pat melody_pat      = (C5 C5 G5<fastVib>:4 G5 A5 G5<exprVib>:4) (C3:2 .) * 4
pat melody_alt_pat  = (E5 E5 G5<fastVib>:4 F5 E5 C5<slide>:4)
pat bass_pat        = (C3 . C3 . ) * 2 (C3 . . .) * 2  (G2 . . .) * 2
pat arp_pat         = C4<majArp>:4 E4<majArp>:4 G4<majArp>:4 C5<majArp>:4
pat snare_pat       = (snare . . .) (snare . . .) (snare . . .)
pat hihat_pat       = (hihat . . .) * 4 (hihat hihat) * 8

seq lead_seq        = melody_pat melody_alt_pat
seq bass_seq        = bass_pat
seq arp_seq         = arp_pat * 2
seq hihat_seq       = hihat_pat
seq snare_seq       = snare_pat

channel 1 => inst lead  seq lead_seq
channel 2 => inst arp   seq arp_seq
channel 3 => inst bass  seq bass_seq
channel 4 => inst hihat seq hihat_seq
channel 5 => inst snare seq snare_seq

play
`
        },
      ],
      defaults: {
        instruments: 'nes-sample-instruments',
        effects: 'nes-sample-fx',
        structure: 'nes-sample-structure',
      },
    },
  };
