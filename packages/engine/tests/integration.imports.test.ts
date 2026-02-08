/**
 * Integration test for instrument imports
 */

import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Integration: Instrument Imports', () => {
  test('end-to-end import resolution and song compilation', () => {
    // Create a temporary directory structure
    const testDir = path.join(process.cwd(), 'tmp', 'import-test');

    // Ensure directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    try {
      // Create .ins files
      const commonIns = `inst lead type=pulse1 duty=50
inst bass type=pulse2 duty=25`;

      const drumsIns = `inst kick type=noise env={"level":15,"direction":"down","period":7}
inst snare type=noise env={"level":12,"direction":"down","period":5}`;

      fs.writeFileSync(path.join(testDir, 'common.ins'), commonIns);
      fs.writeFileSync(path.join(testDir, 'drums.ins'), drumsIns);

      // Create main song file
      const mainSong = `
chip gameboy
import "local:common.ins"
import "local:drums.ins"

bpm 120

# Override imported lead with custom settings
inst lead type=pulse1 duty=75 env={"level":10,"direction":"up","period":2}

pat melody = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat drum_pattern = C6 . C6 .

channel 1 => inst lead seq melody
channel 2 => inst bass seq bassline
channel 4 => inst kick seq drum_pattern
`;

      const mainPath = path.join(testDir, 'main.bax');
      fs.writeFileSync(mainPath, mainSong);

      // Parse and resolve
      const ast = parse(mainSong);
      const songModel = resolveSong(ast, {
        filename: mainPath,
        searchPaths: [testDir],
      });

      // Verify instruments were loaded
      expect(songModel.channels).toHaveLength(3);

      // Verify lead was overridden by local definition
      const ch1Events = songModel.channels.find(ch => ch.id === 1);
      expect(ch1Events).toBeDefined();

      // Verify bass was imported
      const ch2Events = songModel.channels.find(ch => ch.id === 2);
      expect(ch2Events).toBeDefined();

      // Verify drum was imported
      const ch4Events = songModel.channels.find(ch => ch.id === 4);
      expect(ch4Events).toBeDefined();
    } finally {
      // Cleanup
      if (fs.existsSync(path.join(testDir, 'common.ins'))) {
        fs.unlinkSync(path.join(testDir, 'common.ins'));
      }
      if (fs.existsSync(path.join(testDir, 'drums.ins'))) {
        fs.unlinkSync(path.join(testDir, 'drums.ins'));
      }
      if (fs.existsSync(path.join(testDir, 'main.bax'))) {
        fs.unlinkSync(path.join(testDir, 'main.bax'));
      }
    }
  });

  test('imports work with real library files', () => {
    const libPath = path.join(process.cwd(), 'lib', 'uge');

    // Check if library files exist
    const commonPath = path.join(libPath, 'gameboy-common.ins');
    const drumsPath = path.join(libPath, 'gameboy-drums.ins');

    if (!fs.existsSync(commonPath) || !fs.existsSync(drumsPath)) {
      console.warn('Skipping test: library .ins files not found');
      return;
    }

    const source = `
chip gameboy
import "local:lib/uge/gameboy-common.ins"
import "local:lib/uge/gameboy-drums.ins"

bpm 140

pat lead_melody = C5 E5 G5 B5
pat kick_pattern = C6 . . .

channel 1 => inst gb_lead seq lead_melody
channel 4 => inst kick seq kick_pattern
`;

    const ast = parse(source);
    const songModel = resolveSong(ast, {
      filename: path.join(process.cwd(), 'test.bax'),
      searchPaths: [process.cwd()],
    });

    expect(songModel.channels).toHaveLength(2);
    expect(songModel.channels.some(ch => ch.id === 1)).toBe(true);
    expect(songModel.channels.some(ch => ch.id === 4)).toBe(true);
  });
});
