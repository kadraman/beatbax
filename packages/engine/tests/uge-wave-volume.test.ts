import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { exportUGE } from '../src/export/ugeWriter';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('UGE wave instrument volume storage', () => {
    const file = join(tmpdir(), 'test_wave_vol.uge');

    afterEach(() => {
        if (existsSync(file)) unlinkSync(file);
    });

    test('stores raw 0..3 volume values for wave instruments', async () => {
        const src = `
chip gameboy

inst w1 type=wave wave=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] volume=100
inst w2 type=wave wave=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] volume=50
inst w3 type=wave wave=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] volume=25
inst w4 type=wave wave=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] volume=0
`;
        const ast = parse(src);
        const song = resolveSong(ast as any);

        await exportUGE(song as any, file, { debug: false });

        const b = readFileSync(file);

        const names = ['w1', 'w2', 'w3', 'w4'];
        const expected: Record<string, number> = { w1: 1, w2: 2, w3: 3, w4: 0 };

        // Derived offset for the wave instrument `output_level` field (u32):
        // Calculated from writer record layout:
        //   type (u32) = 4
        //   name (shortstring) = 1 + 255 = 256
        //   length (u32) = 4
        //   lengthEnabled (bool) = 1
        //   unused1_u8 = 1
        //   unused2_u32 = 4
        //   unused3_u8 = 1
        //   unused4_u32 = 4
        //   unused5_u32 = 4
        //   unused6_u32 = 4
        //   unused7_u8 = 1
        // -------------------------------
        // total = 4 + 256 + 4 + 1 + 1 + 4 + 1 + 4 + 4 + 4 + 1 = 284
        const VOLUME_FIELD_OFFSET_FROM_RECORD_START = 284;

        for (const n of names) {
            const idx = b.indexOf(Buffer.from(n));
            expect(idx).toBeGreaterThan(0);
            // Find the start of the instrument record (search for the preceding type u32 = 1)
            const recStart = b.lastIndexOf(Buffer.from([0x01, 0x00, 0x00, 0x00]), idx);
            expect(recStart).toBeGreaterThan(0);
            const volPos = recStart + VOLUME_FIELD_OFFSET_FROM_RECORD_START;
            expect(volPos + 4).toBeLessThanOrEqual(b.length);
            const vol = b.readUInt32LE(volPos);
            expect(vol).toBe(expected[n]);
        }
    });
});
