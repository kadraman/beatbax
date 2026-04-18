import { SongModel } from '../song/songModel.js';
/**
 * Render a song to PCM samples without using WebAudio.
 * This is a simplified renderer for CLI/offline use.
 */
export interface RenderOptions {
    sampleRate?: number;
    duration?: number;
    channels?: 1 | 2;
    bpm?: number;
    renderChannels?: number[];
    normalize?: boolean;
    vibDepthScale?: number;
    regPerTrackerBaseFactor?: number;
    regPerTrackerUnit?: number;
}
export declare function renderSongToPCM(song: SongModel, opts?: RenderOptions): Float32Array;
//# sourceMappingURL=pcmRenderer.d.ts.map