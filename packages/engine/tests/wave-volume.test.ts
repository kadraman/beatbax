import { parse } from '../src/parser/index';
import { mapWaveVolumeToUGE } from '../src/export/ugeWriter';
import { renderSongToPCM } from '../src/audio/pcmRenderer';

describe('Wave Channel Volume', () => {
    test('parses volume parameter correctly and defaults', () => {
        const ast = parse(`
      inst w1 type=wave wave=[0,8,15,8] volume=100
      inst w2 type=wave wave=[0,8,15,8] volume=50
      inst w3 type=wave wave=[0,8,15,8] volume=25
      inst w4 type=wave wave=[0,8,15,8] volume=0
      inst wD type=wave wave=[0,8,15,8]
    `);

        expect(ast.insts['w1'].volume).toBe(100);
        expect(ast.insts['w2'].volume).toBe(50);
        expect(ast.insts['w3'].volume).toBe(25);
        expect(ast.insts['w4'].volume).toBe(0);
        expect(ast.insts['wD'].volume).toBe(100); // default
    });

    test('rejects invalid volume values', () => {
        expect(() => parse(`inst bad type=wave wave=[0,1,2] volume=75`)).toThrow(/Invalid wave volume/);
    });

    test('maps to UGE volume values correctly', () => {
        expect(mapWaveVolumeToUGE(100)).toBe(1);
        expect(mapWaveVolumeToUGE('100%')).toBe(1);
        expect(mapWaveVolumeToUGE(50)).toBe(2);
        expect(mapWaveVolumeToUGE(25)).toBe(3);
        expect(mapWaveVolumeToUGE(0)).toBe(0);
    });

    test('render amplitude scales with volume', () => {
        const baseSong = {
            pats: {},
            seqs: {},
            bpm: 120,
            insts: {
                'w100': { type: 'wave', wave: [0, 8, 15, 8], volume: 100 },
                'w50': { type: 'wave', wave: [0, 8, 15, 8], volume: 50 }
            },
            channels: [
                { id: 3, defaultInstrument: 'w100', events: [{ type: 'note', token: 'C4', instrument: 'w100' }] }
            ]
        } as any;

        const testSong = JSON.parse(JSON.stringify(baseSong));
        testSong.insts['w100'] = baseSong.insts['w100'];

        const song50 = JSON.parse(JSON.stringify(baseSong));
        song50.insts['w100'] = baseSong.insts['w50'];

        const samples100: Float32Array = renderSongToPCM(baseSong, { duration: 0.05, sampleRate: 22050, normalize: false });
        const samples50: Float32Array = renderSongToPCM(song50, { duration: 0.05, sampleRate: 22050, normalize: false });

        let max100 = 0;
        for (const s of samples100) max100 = Math.max(max100, Math.abs(s));
        let max50 = 0;
        for (const s of samples50) max50 = Math.max(max50, Math.abs(s));

        // 50% volume should be roughly half amplitude of 100% (allow tolerance)
        expect(max50 / max100).toBeGreaterThan(0.4);
        expect(max50 / max100).toBeLessThan(0.6);
    });
});
