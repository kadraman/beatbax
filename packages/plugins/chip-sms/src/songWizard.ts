/**
 * BeatBax metadata and example song templates for the SMS (SN76489) chip plugin.
 *
 * These are intended as starting points for users to build their own songs, and
 * are not meant to be comprehensive demonstrations of the plugin's capabilities.
 */

export const SMS_IMAGE_BASE64 =
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
