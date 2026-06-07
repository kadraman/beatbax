/**
 * ExportManager - Handles JSON/MIDI/UGE/WAV exports for browser
 */

import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song';
import { renderSongToPCM } from '@beatbax/engine';
import { chipRegistry } from '@beatbax/engine/chips';
import { createLogger } from '@beatbax/engine/util/logger';
import { exportUGE, writeWAV } from '@beatbax/engine/export';
import { exporterRegistry } from '../plugins/browser-exporter-registry';
import { getCapturedWrite, clearCapturedWrite } from '../io/write-capture';

import type { EventBus } from '../utils/event-bus';
import { exportStatus, exportFormat as exportFormatAtom } from '../stores/ui.store';
import { buildMIDI } from './midi-builder';
import { validateForExport } from './export-validator';
import { collectPcmWavExportWarnings } from './pcm-export-warnings';
import {
  downloadText,
  downloadBinary,
  ensureExtension,
  sanitizeFilename,
  MIME_TYPES,
  ExportHistory,
} from './download-helper';
import { settingAudioSampleRate } from '../stores/settings.store';

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
    let baseFilename = options.filename ?? 'song';

    log.debug(`Export started: format=${format}`);
    this.eventBus.emit('export:started', { format });
    exportStatus.set('exporting');
    exportFormatAtom.set(format);

    try {
      // Parse source
      const ast = parse(source);
      const metadataName = String((ast as any)?.metadata?.name ?? '').trim();
      if (metadataName) {
        baseFilename = sanitizeFilename(metadataName.toLowerCase());
      }

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
          warnings.push(...collectPcmWavExportWarnings(resolved));
          result = await this.exportWAV(source, resolved, baseFilename);
          break;
        case 'famitracker':
          result = await this.exportViaPlugin(resolved, baseFilename, format, (msg) => warnings.push(msg));
          break;
        default:
          result = await this.exportViaPlugin(resolved, baseFilename, format, (msg) => warnings.push(msg));
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

    // exportUGE uses writeFileSync; Vite aliases fs to browser-fs at build time.
    try {
      clearCapturedWrite();
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
   * Export as WAV using the same PCM renderer as the CLI (parity with headless export).
   */
  private async exportWAV(
    _source: string,
    resolved: any,
    baseFilename: string
  ): Promise<ExportResult> {
    const filename = ensureExtension(baseFilename, 'wav');

    const channels = Array.isArray(resolved.channels) ? resolved.channels : [];
    const hasEvents = channels.some((ch: any) => Array.isArray(ch?.events) && ch.events.length > 0);
    if (!hasEvents) {
      throw new Error('Song has no audio events to export.');
    }

    const sampleRate = parseInt(settingAudioSampleRate.get(), 10) || 44100;
    const chipId = String(resolved?.chip ?? '').toLowerCase();
    const chipPlugin = chipId ? chipRegistry.get(chipRegistry.resolve(chipId)) : undefined;
    if (chipPlugin?.preloadForPCM && resolved.insts) {
      await chipPlugin.preloadForPCM(resolved.insts as Record<string, any>);
    }

    const samples = renderSongToPCM(resolved, {
      sampleRate,
      channels: 2,
      bpm: typeof resolved.bpm === 'number' ? resolved.bpm : undefined,
    });

    const wavBuffer = writeWAV(samples, { sampleRate, bitDepth: 16, channels: 2 });
    downloadBinary(new Uint8Array(wavBuffer), filename, MIME_TYPES.wav);

    return {
      success: true,
      format: 'wav',
      filename,
      size: wavBuffer.byteLength,
    };
  }

  private async exportViaPlugin(
    resolved: any,
    baseFilename: string,
    format: string,
    onWarn?: (msg: string) => void,
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

    // Resolve the chip plugin so sample assets can be loaded (e.g. NES DMC samples)
    const chipId = String(resolved?.chip ?? '').toLowerCase();
    const chipPlugin = chipId ? chipRegistry.get(chipId) : undefined;

    const ext = plugin.extension.replace(/^\./, '') || this.extensionForFormat(format);
    const filename = ensureExtension(baseFilename, ext);
    const data = await plugin.export(resolved, {
      outputPath: filename,
      resolveSampleAsset: typeof chipPlugin?.resolveSampleAsset === 'function'
        ? (ref: string) => chipPlugin.resolveSampleAsset!(ref)
        : undefined,
      onWarn,
    });

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

