/**
 * Pure Node.js WAV file writer (no WebAudio dependency)
 * Supports PCM16, PCM24, PCM32 bit depths
 */
import { SongModel } from '../song/songModel.js';
import { RenderOptions } from '../audio/pcmRenderer.js';
export interface WavOptions {
    sampleRate: number;
    bitDepth: 16 | 24 | 32;
    channels: 1 | 2;
}
export declare function writeWAV(samples: Float32Array, opts: WavOptions): Buffer;
export declare function exportWAV(samples: Float32Array, outputPath: string, opts: WavOptions, metaOpts?: {
    debug?: boolean;
    verbose?: boolean;
}): Promise<void>;
/**
 * Render a song model to PCM and export as a WAV file.
 */
export declare function exportWAVFromSong(song: SongModel, outputPath: string, options?: RenderOptions & Partial<WavOptions>, metaOpts?: {
    debug?: boolean;
    verbose?: boolean;
}): Promise<void>;
//# sourceMappingURL=wavWriter.d.ts.map