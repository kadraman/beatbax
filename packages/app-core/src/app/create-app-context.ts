import { parseWithPeggy } from '@beatbax/engine/parser';
import { resolveImports, resolveSong } from '@beatbax/engine/song';
import { chipRegistry, getSongValidationIssues } from '@beatbax/engine/chips';
import { loadPluginsFromStorage } from '../plugins/registry-config.js';
import { loadExporterPluginsFromStorage } from '../plugins/exporter-registry-config.js';
import { eventBus } from '../utils/event-bus.js';
import { PlaybackManager } from '../playback/playback-manager.js';
import { ExportManager } from '../export/export-manager.js';
import {
  parseStatus,
  parsedBpm,
  parsedChip,
  validationErrors as validationErrorsAtom,
  validationWarnings as validationWarningsAtom,
} from '../stores/editor.store.js';
import type { ValidationIssue } from '../types/validation.js';
import {
  getCapabilities,
  getClientProfile,
  type ClientCapabilities,
  type ClientProfile,
} from '../client-profile.js';
import { buildImportResolverOptions } from '../import/import-resolver-options.js';

export interface ParsePipelineHooks {
  /** Called when validation errors/warnings are published after a parse pass. */
  onSetValidation?: (errors: ValidationIssue[], warnings: ValidationIssue[]) => void;
}

export interface AppContext {
  eventBus: typeof eventBus;
  playbackManager: PlaybackManager;
  exportManager: ExportManager;
  profile: ClientProfile;
  capabilities: ClientCapabilities;
  initializePlugins: () => void;
  emitParse: (content: string) => Promise<void>;
}

export interface CreateAppContextOptions {
  parseHooks?: ParsePipelineHooks;
}

/**
 * Bootstrap shared application services: plugins, event bus, playback, export,
 * and the parse/resolve pipeline that emits parse:* and validation:* events.
 */
export function createAppContext(options: CreateAppContextOptions = {}): AppContext {
  const profile = getClientProfile();
  const capabilities = getCapabilities(profile);
  const parseHooks = options.parseHooks;

  function initializePlugins(): void {
    loadPluginsFromStorage();
    loadExporterPluginsFromStorage();
  }

  const playbackManager = new PlaybackManager(eventBus);
  const exportManager = new ExportManager(eventBus);

  async function emitParse(content: string): Promise<void> {
    try {
      eventBus.emit('parse:started', undefined);
      parseStatus.set('parsing');
      const parseResult = parseWithPeggy(content);
      const ast = parseResult.ast;

      const errors: ValidationIssue[] = [];
      const warnings: ValidationIssue[] = [];
      for (const e of parseResult.errors) {
        errors.push({
          component: 'parser',
          message: e.message,
          loc: e.loc,
          expected: e.expected,
          found: e.found,
        });
      }
      for (const d of ((ast as any).diagnostics ?? [])) {
        const entry = { component: d.component ?? 'parser', message: d.message, loc: d.loc };
        if (d.level === 'error') errors.push(entry);
        else warnings.push(entry);
      }

      const publishValidation = () => {
        eventBus.emit('validation:errors', { errors });
        validationErrorsAtom.set(errors);
        eventBus.emit('validation:warnings', { warnings });
        validationWarningsAtom.set(warnings);
        parseHooks?.onSetValidation?.(errors, warnings);
      };

      if (parseResult.hasErrors) {
        publishValidation();
        parseStatus.set('error');
        return;
      }

      let song: any = null;
      let resolvedAst: typeof ast = ast;
      try {
        const resolveSongOpts = {
          onWarn: (w: ValidationIssue) => {
            warnings.push(w);
          },
        };
        const resolveImportsOpts = buildImportResolverOptions({
          onWarn: (message: string, loc?: any) => {
            warnings.push({ component: 'import-resolver', message, loc });
          },
        });
        if ((ast as any).imports?.length > 0) {
          resolvedAst = await resolveImports(ast as any, resolveImportsOpts);
          song = resolveSong(resolvedAst as any, resolveSongOpts);
        } else {
          song = resolveSong(ast as any, resolveSongOpts);
        }
      } catch (resolveErr: any) {
        eventBus.emit('parse:error', {
          error: resolveErr,
          message: resolveErr.message ?? String(resolveErr),
        });
        parseStatus.set('error');
        return;
      }

      if ((ast as any).imports?.length > 0) {
        for (const e of getSongValidationIssues(resolvedAst as any)) {
          const message = e.message;
          if (!warnings.some(w => w.message === message)) {
            warnings.push({
              component: resolvedAst.chip
                ? chipRegistry.resolve(String(resolvedAst.chip).toLowerCase())
                : 'plugin',
              message,
            });
          }
        }
      }

      publishValidation();

      const valid = errors.length === 0;
      parseStatus.set(valid ? 'success' : 'error');
      parsedBpm.set((ast as any).bpm || 120);
      parsedChip.set((ast as any).chip || 'gameboy');
      eventBus.emit('parse:success', {
        ast,
        resolvedAst,
        song,
        sourceBpm: (ast as any).bpm ?? 120,
        valid,
      });
    } catch (err: any) {
      eventBus.emit('parse:error', { error: err, message: err.message ?? String(err) });
      parseStatus.set('error');
    }
  }

  return {
    eventBus,
    playbackManager,
    exportManager,
    profile,
    capabilities,
    initializePlugins,
    emitParse,
  };
}
