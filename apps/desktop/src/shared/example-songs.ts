/** Built-in example songs for the native macOS File menu (paths match bundled songs). */
export interface DesktopExampleSong {
  label: string;
  path: string;
}

export interface DesktopExampleSongGroup {
  group: string;
  songs: DesktopExampleSong[];
}

export const DESKTOP_EXAMPLE_SONG_GROUPS: DesktopExampleSongGroup[] = [
  {
    group: 'Game Boy',
    songs: [
      { label: 'a_trainers_journey.bax', path: '/songs/gameboy/a_trainers_journey.bax' },
      { label: 'crypt_of_fallen_kings.bax', path: '/songs/gameboy/crypt_of_fallen_kings.bax' },
      { label: 'digital_citadel.bax', path: '/songs/gameboy/digital_citadel.bax' },
      { label: 'grassland_dash.bax', path: '/songs/gameboy/grassland_dash.bax' },
      { label: 'graveyard_shift.bax', path: '/songs/gameboy/graveyard_shift.bax' },
      { label: 'heroes_call.bax', path: '/songs/gameboy/heroes_call.bax' },
      { label: 'mystic_voyage.bax', path: '/songs/gameboy/mystic_voyage.bax' },
      { label: 'night_hawk.bax', path: '/songs/gameboy/night_hawk.bax' },
    ],
  },
  {
    group: 'NES/Famicom',
    songs: [
      { label: 'battle_fanfare.bax', path: '/songs/nes/battle_fanfare.bax' },
      { label: 'iron_keep.bax', path: '/songs/nes/iron_keep.bax' },
      { label: 'kingdom_hall.bax', path: '/songs/nes/kingdom_hall.bax' },
      { label: 'puffball_parade.bax', path: '/songs/nes/puffball_parade.bax' },
      { label: 'shadow_temple.bax', path: '/songs/nes/shadow_temple.bax' },
      { label: 'silver_orbit.bax', path: '/songs/nes/silver_orbit.bax' },
      { label: 'wily_fortress.bax', path: '/songs/nes/wily_fortress.bax' },
    ],
  },
  {
    group: 'SMS',
    songs: [
      { label: 'battle_field.bax', path: '/songs/sms/battle_field.bax' },
    ],
  },
  {
    group: 'Game Gear',
    songs: [
      { label: 'battle_field.bax', path: '/songs/sms/battle_field.bax' },
    ],
  },
  {
    group: 'ZX Spectrum 128',
    songs: [
      { label: 'spectral_phantoms.bax', path: '/songs/spectrum-128/spectral_phantoms.bax' },
      { label: 'steel_justice.bax', path: '/songs/spectrum-128/steel_justice.bax' },
    ],
  },
  {
    group: 'Amstrad CPC',
    songs: [
      { label: 'cave_run_theme.bax', path: '/songs/spectrum-128/cave_run_theme.bax' },
    ],
  },
];
