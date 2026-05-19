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
