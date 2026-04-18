/**
 * UGE v6 binary file writer for hUGETracker.
 *
 * This writer exports a beatbax SongModel to a valid UGE v6 file that can be
 * opened in hUGETracker and processed by uge2source.exe.
 *
 * Format spec: Based on hUGETracker source (song.pas, HugeDatatypes.pas)
 * Reference implementation: generate_minimal_uge.py (validated with uge2source.exe)
 *
 * Key discoveries:
 * - TInstrumentV3 is a packed record with embedded TPattern (64 cells × 17 bytes)
 * - SubpatternEnabled is a semantic flag; bytes are ALWAYS written (1381 bytes per instrument)
 * - Pascal AnsiString format: u32 length + bytes (length does NOT include null terminator)
 * - Pattern cell v6 (TCellV2): 17 bytes = Note(u32) + Instrument(u32) + Volume(u32) + EffectCode(u32) + EffectParams(u8)
 * - Volume field: 0x00005A00 (23040) means "no volume change"
 */
import { SongModel } from '../song/songModel.js';
/**
 * Write a minimal wave instrument (TInstrumentV3 with type=1)
 * Total size: 1381 bytes
 */
export declare function mapWaveVolumeToUGE(vol: any): number;
export declare function convertPanToEnum(pan: any, strictGb: boolean, context?: 'instrument' | 'inline'): 'L' | 'C' | 'R' | undefined;
/**
 * Export a beatbax SongModel to UGE v6 binary format.
 */
export declare function exportUGE(song: SongModel, outputPath: string, opts?: {
    debug?: boolean;
    strictGb?: boolean;
    verbose?: boolean;
    onWarn?: (message: string) => void;
}): Promise<void>;
export default exportUGE;
//# sourceMappingURL=ugeWriter.d.ts.map