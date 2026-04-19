/**
 * ExportManager - Handles JSON/MIDI/UGE/WAV exports for browser
 */

import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song';
import { Player } from '@beatbax/engine/audio/playback';
import { exporterRegistry } from '@beatbax/engine/export';
import { createLogger } from '@beatbax/engine/util/logger';

import type { EventBus } from '../utils/event-bus';
import { exportStatus, exportFormat as exportFormatAtom } from '../stores/ui.store';
import { buildMIDI } from './midi-builder';
import { validateForExport } from './export-validator';
import {
  downloadText,
  downloadBinary,
  ensureExtension,
  MIME_TYPES,
  ExportHistory,
} from './download-helper';
import { getCapturedWrite, clearCapturedWrite } from '../utils/browser-fs';
import { settingAudioSampleRate, settingAudioBufferFrames } from '../stores/settings.store';

const log = createLogger('ui:export-manager');

/**
 * Available export formats — open string so plugin-provided IDs are accepted.
 */
export type ExportFormat = string;

/**
 * Export options
 */
export interface ExportOptions {
  /** Base filename (without extension) */
  filename?: string;
  /** Whether to validate before exporting */
  validate?: boolean;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  filename: string;
  size?: number;
  error?: Error;
  warnings?: string[];
}

/**
 * ExportManager - Coordinates all export operations
 */
export class ExportManager {
  private history = new ExportHistory();

  constructor(private eventBus: EventBus) {}

  /**
   * Export the current song to the given format
   */
  async export(
    source: string,
    format: ExportFormat,
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    const validate = options.validate !== false;
    const warnings: string[] = [];
    const baseFilename = options.filename ?? 'song';

    log.debug(`Export started: format=${format}`);
    this.eventBus.emit('export:started', { format });
    exportStatus.set('exporting');
    exportFormatAtom.set(format);

    try {
      // Parse source
      const ast = parse(source);

      // Validate if requested
      if (validate) {
        const validation = validateForExport(ast, format);
        if (!validation.valid) {
          const errorMessage = validation.errors
            .map(e => e.suggestion ? `${e.message} — ${e.suggestion}` : e.message)
            .join('; ');
          throw new Error(`Validation failed: ${errorMessage}`);
        }
        warnings.push(...validation.warnings.map(w =>
          w.suggestion ? `${w.message} — ${w.suggestion}` : w.message
        ));
      }

      // Resolve song
      const resolved = resolveSong(ast as any, {
        onWarn: (w: any) => {
          const msg = typeof w === 'string' ? w : (w.message || String(w));
          warnings.push(msg);
          log.debug('Resolver warning:', msg);
        },
      });

      // Perform the export
      let result: ExportResult;
      switch (format) {
        case 'json':
          result = await this.exportJSON(resolved, baseFilename);
          break;
        case 'midi':
          result = await this.exportMIDI(resolved, baseFilename);
          break;
        case 'uge':
          result = await this.exportUGE(resolved, baseFilename, (msg) => warnings.push(msg));
          break;
        case 'wav':
          result = await this.exportWAV(source, resolved, baseFilename);
          break;
        case 'famitracker':
          result = await this.exportViaPlugin(resolved, baseFilename, format);
          break;
        default:
          result = await this.exportViaPlugin(resolved, baseFilename, format);
          break;
      }

      result.warnings = warnings;

      // Record in history
      this.history.add({
        format,
        filename: result.filename,
        timestamp: new Date(),
        size: result.size,
      });

      this.eventBus.emit('export:success', { format, filename: result.filename });
      exportStatus.set('success');
      log.debug(`Export success: ${result.filename} (${result.size ?? 0} bytes)`);
      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error(`Export failed (${format}):`, error);
      this.eventBus.emit('export:error', { format, error });
      exportStatus.set('error');
      return {
        success: false,
        format,
        filename: ensureExtension(baseFilename, this.extensionForFormat(format)),
        error,
      };
    }
  }

  private extensionForFormat(format: string): string {
    const plugin = exporterRegistry.get(format);
    if (plugin) {
      return plugin.extension.replace(/^\./, '') || format;
    }
    if (format === 'midi') return 'mid';
    return format;
  }

  /**
   * Export as JSON (ISM format)
   */
  private async exportJSON(resolved: any, baseFilename: string): Promise<ExportResult> {
    const filename = ensureExtension(baseFilename, 'json');
    const json = JSON.stringify(resolved, null, 2);

    downloadText(json, filename, MIME_TYPES.json);

    return {
      success: true,
      format: 'json',
      filename,
      size: json.length,
    };
  }

  /**
   * Export as MIDI (Standard MIDI File, Type 1)
   */
  private async exportMIDI(resolved: any, baseFilename: string): Promise<ExportResult> {
    const filename = ensureExtension(baseFilename, 'mid');
    const midiData = buildMIDI(resolved);

    downloadBinary(midiData, filename, MIME_TYPES.mid);

    return {
      success: true,
      format: 'midi',
      filename,
      size: midiData.byteLength,
    };
  }

  /**
   * Export as UGE (hUGETracker v6 format)
   * Uses the engine's exportUGE function via a browser-safe fs mock
   */
  private async exportUGE(resolved: any, baseFilename: string, onWarn?: (msg: string) => void): Promise<ExportResult> {
    const filename = ensureExtension(baseFilename, 'uge');

    // Attempt to dynamically import the engine's UGE exporter
    // The 'fs' module is aliased to our browser-fs.ts mock via Vite config
    try {
      clearCapturedWrite();

      // Dynamic import to allow graceful fallback if unavailable
      const { exportUGE } = await import('@beatbax/engine/export');
      await exportUGE(resolved as any, filename, { onWarn });

      // Retrieve captured data
      const captured = getCapturedWrite();
      if (captured && captured.data.length > 0) {
        downloadBinary(captured.data, filename, MIME_TYPES.uge);
        clearCapturedWrite();
        return {
          success: true,
          format: 'uge',
          filename,
          size: captured.data.length,
        };
      } else {
        throw new Error('UGE export produced no data. The fs mock may not be configured.');
      }
    } catch (err: any) {
      // If engine UGE export fails in browser (fs not mocked correctly), provide fallback message
      if (err.message?.includes('writeFileSync is not a function') ||
          err.message?.includes('writeFileSync') ||
          err.message?.includes('fs')) {
        throw new Error(
          'UGE export requires the CLI in this environment. Run: npm run cli -- export uge song.bax song.uge'
        );
      }
      throw err;
    }
  }

  /**
   * Export as WAV using WebAudio OfflineAudioContext
   */
  private async exportWAV(
    _source: string,
    resolved: any,
    baseFilename: string
  ): Promise<ExportResult> {
    const filename = ensureExtension(baseFilename, 'wav');

    // Calculate duration from events
    let maxTicks = 0;
    for (const ch of (resolved.channels || [])) {
      const evts = ch.events || ch.pat || [];
      if (Array.isArray(evts) && evts.length > maxTicks) {
        maxTicks = evts.length;
      }
    }

    const bpm = (typeof resolved.bpm === 'number') ? resolved.bpm : 128;
    const secondsPerBeat = 60 / bpm;
    const tickSeconds = secondsPerBeat / 4;
    const duration = Math.ceil(maxTicks * tickSeconds) + 1;

    if (duration <= 0 || maxTicks === 0) {
      throw new Error('Song has no audio events to export.');
    }

    // Create offline context
    const OfflineCtxCtor =
      (globalThis as any).OfflineAudioContext ||
      (globalThis as any).webkitOfflineAudioContext;

    if (!OfflineCtxCtor) {
      throw new Error('OfflineAudioContext is not available in this browser.');
    }

    const sampleRate = parseInt(settingAudioSampleRate.get(), 10) || 44100;
    const bufferFrames = parseInt(settingAudioBufferFrames.get(), 10) || 4096;
    const lengthInSamples = Math.ceil(duration * sampleRate);
    const offlineCtx = new OfflineCtxCtor(2, lengthInSamples, sampleRate);

    // Create player — buffered mode OFF so all events go to the scheduler queue
    const offlinePlayer = new Player(offlineCtx, { buffered: false });

    // Override the scheduler's tick to drain ALL queued events in chunks of
    // bufferFrames to balance memory and rendering speed.
    const scheduler = (offlinePlayer as any).scheduler;
    if (scheduler) {
      scheduler.tick = function () {
        const q: Array<{ time: number; fn: () => void }> = (this as any).queue ?? [];
        let processed = 0;
        while (q.length > 0 && processed < bufferFrames) {
          const ev = q.shift()!;
          try { ev.fn(); } catch (_e) { /* ignore */ }
          processed++;
        }
        // Drain any remainder
        while (q.length > 0) {
          const ev = q.shift()!;
          try { ev.fn(); } catch (_e) { /* ignore */ }
        }
      };
    }

    // playAST schedules all audio events onto the scheduler queue
    await offlinePlayer.playAST(resolved);

    // Flush — invoke every queued event so audio nodes are wired into offlineCtx
    if (scheduler && typeof scheduler.tick === 'function') {
      scheduler.tick();
    }

    // Render to audio buffer
    const audioBuffer = await offlineCtx.startRendering();
    const wavData = audioBufferToWav(audioBuffer);

    downloadBinary(wavData, filename, MIME_TYPES.wav);

    return {
      success: true,
      format: 'wav',
      filename,
      size: wavData.byteLength,
    };
  }

  private async exportViaPlugin(
    resolved: any,
    baseFilename: string,
    format: string,
  ): Promise<ExportResult> {
    const plugin = exporterRegistry.get(format);
    if (!plugin) throw new Error(`Unknown export format: ${format}`);

    // Validate with plugin's validate() if available
    if (typeof plugin.validate === 'function') {
      const errors = plugin.validate(resolved);
      if (Array.isArray(errors) && errors.length > 0) {
        throw new Error(`Export failed: ${errors.join('; ')}`);
      }
    }

    const ext = plugin.extension.replace(/^./, '') || this.extensionForFormat(format);
    const filename = ensureExtension(baseFilename, ext);
    const data = await plugin.export(resolved, { outputPath: filename });

    if (typeof data === 'string') {
      downloadText(data, filename, plugin.mimeType || MIME_TYPES[ext] || 'text/plain');
      return { success: true, format, filename, size: data.length };
    }

    if (data instanceof Uint8Array) {
      downloadBinary(data, filename, plugin.mimeType || MIME_TYPES[ext] || 'application/octet-stream');
      return { success: true, format, filename, size: data.byteLength };
    }

    if (data instanceof ArrayBuffer) {
      downloadBinary(new Uint8Array(data), filename, plugin.mimeType || MIME_TYPES[ext] || 'application/octet-stream');
      return { success: true, format, filename, size: data.byteLength };
    }

    throw new Error(`Exporter '${plugin.id}' did not return downloadable data in browser mode.`);
  }

  /**
   * Get export history
   */
  getHistory() {
    return this.history.getAll();
  }
}

// ─── WAV helpers ──────────────────────────────────────────────────────────────

/**
 * Convert an AudioBuffer to a WAV file as ArrayBuffer
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const data = new Float32Array(buffer.length * numChannels);
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      data[i * numChannels + ch] = buffer.getChannelData(ch)[i];
    }
  }

  const dataLength = data.length * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
