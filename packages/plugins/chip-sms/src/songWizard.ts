/**
 * BeatBax metadata and example song templates for the SMS (SN76489) chip plugin.
 *
 * These are intended as starting points for users to build their own songs, and
 * are not meant to be comprehensive demonstrations of the plugin's capabilities.
 */

export const SMS_IMAGE_BASE64 =
'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';
const GG_IMAGE_BASE64 =
'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';

export const smsSongWizard = {
    // Top-level metadata/templates kept for backward compatibility with any
    // consumer that reads them directly, but the wizard navigator uses
    // consoleVariants to show SMS and Game Gear as separate entries.
    metadata: {
      chipDisplayName: 'SMS / Game Gear (SN76489)',
      platform: 'Sega Master System / Game Gear',
      year: '1985',
      channelSummary: '3 tone, 1 noise',
      image: SMS_IMAGE_BASE64,
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

    // ── Console variants ──────────────────────────────────────────────────────
    // Each variant appears as a separate chip navigator entry in the New Song
    // Wizard. The `chipId` is used in the generated `chip <name>` directive.
    consoleVariants: [
      // ── Sega Master System (mono, no stereo panning) ──────────────────────
      {
        chipId: 'sms',
        metadata: {
          chipDisplayName: 'Sega Master System (SN76489)',
          platform: 'Sega Master System',
          year: '1985',
          channelSummary: '3 tone, 1 noise (mono)',
          image: SMS_IMAGE_BASE64,
        },
        templates: {
          instruments: [
            {
              id: 'sms-sample-instruments',
              label: 'Sample instruments',
              content:
`
# SMS attenuation: 0 = loudest, 15 = mute
inst lead   type=tone1  vol=0  vol_env=[0,3,6,9,12,15]
inst harm   type=tone2  vol=1  vol_env=[1,4,7,10,13,15]
inst bass   type=tone3  vol=0  vol_env=[0,4,9,14,15]

inst kick   type=noise  noise_mode=white     noise_rate=2  vol_env=[0,3,7,12,15]
inst snare  type=noise  noise_mode=white     noise_rate=1  vol_env=[1,4,7,10,12,14,15]  noise_rate_env=[0,0,1,1,2]
inst hihat  type=noise  noise_mode=white     noise_rate=0  vol_env=[6,11,14,15]
inst shaker type=noise  noise_mode=periodic  noise_rate=1  vol_env=[4,8,12,15]
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
channel 2 => inst harm  seq arp_seq
channel 3 => inst bass  seq bass_seq
channel 4 => inst kick  seq drums_seq

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
      },

      // ── Sega Game Gear (stereo panning via pan) ────────────────────────
      {
        chipId: 'gg',
        metadata: {
          chipDisplayName: 'Sega Game Gear (SN76489 + Stereo)',
          platform: 'Sega Game Gear',
          year: '1990',
          // Game Gear adds hardware stereo routing on top of the SMS PSG
          channelSummary: '3 tone, 1 noise (stereo)',
          image: GG_IMAGE_BASE64,
        },
        templates: {
          instruments: [
            {
              id: 'gg-sample-instruments',
              label: 'Sample instruments (stereo)',
              content:
`
# Game Gear attenuation: 0 = loudest, 15 = mute
# pan=R  — right channel only
# pan=L  — left channel only
# pan=C  — both channels (center)
inst lead   type=tone1  vol=0  vol_env=[0,3,6,9,12,15]              pan=R
inst harm   type=tone2  vol=2  vol_env=[2,5,8,11|11]                pan=L
inst bass   type=tone3  vol=0  vol_env=[0,4,9,14,15]                pan=C

inst kick   type=noise  noise_mode=white     noise_rate=2  vol_env=[0,3,7,12,15]            pan=C
inst snare  type=noise  noise_mode=white     noise_rate=1  vol_env=[1,4,7,10,12,14,15]  noise_rate_env=[0,0,1,1,2]  pan=C
inst hihat  type=noise  noise_mode=white     noise_rate=0  vol_env=[6,11,14,15]              pan=C
inst shaker type=noise  noise_mode=periodic  noise_rate=1  vol_env=[4,8,12,15]               pan=C
`,
            },
          ],
          effects: [
            {
              id: 'gg-sample-fx',
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
              id: 'gg-sample-structure',
              label: 'Sample structure (stereo)',
              content:
`
# Lead melody panned right, harmony left, bass and drums centered.
pat melody_pat      = (C5 C5 G5<fastVib>:4 G5 A5 G5<exprVib>:4) (C3:2 .) * 4
pat melody_alt_pat  = (E5 E5 G5<fastVib>:4 F5 E5 C5<slide>:4)
pat harm_pat        = C4<majArp>:4 E4<majArp>:4 G4<majArp>:4 C5<majArp>:4
pat bass_pat        = (C3 . C3 . ) * 2 (C3 . . .) * 2  (G2 . . .) * 2
pat drums_pat       = (snare . . .) (snare . . .) (snare . . .)
pat drums_alt_pat   = (snare . . .) * 2 (shaker hihat) * 8

seq lead_seq        = melody_pat melody_alt_pat
seq harm_seq        = harm_pat * 2
seq bass_seq        = bass_pat
seq drums_seq       = drums_pat drums_alt_pat

channel 1 => inst lead  seq lead_seq
channel 2 => inst harm  seq harm_seq
channel 3 => inst bass  seq bass_seq
channel 4 => inst kick  seq drums_seq

play
`
            },
          ],
          defaults: {
            instruments: 'gg-sample-instruments',
            effects: 'gg-sample-fx',
            structure: 'gg-sample-structure',
          },
        },
      },
    ],
  };
