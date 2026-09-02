import { parse } from '@beatbax/engine/parser';
import { resolveImports, resolveSong } from '@beatbax/engine/song';
import { chipRegistry } from '@beatbax/engine/chips';
import { exporterRegistry } from '@beatbax/app-core/plugins/browser-exporter-registry';
import { buildImportResolverOptions } from '@beatbax/app-core/import/import-resolver-options';
import type { ExportManager } from '@beatbax/app-core/export/export-manager';
import type { ExportFormat } from '@beatbax/app-core/export/export-manager';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { DesktopOutputPanelHandle } from '../components/panels/OutputPanels';

export interface ExportHandlerDeps {
  eventBus: EventBus;
  exportManager: ExportManager;
  getSource: () => string;
  getFilename: () => string;
  problemsPanel: DesktopOutputPanelHandle;
  outputPanel: DesktopOutputPanelHandle;
  showProblems: () => void;
  showOutput: () => void;
}

export async function handleDesktopExport(
  format: ExportFormat,
  deps: ExportHandlerDeps,
): Promise<void> {
  const source = deps.getSource();
  if (!source.trim()) {
    deps.problemsPanel.addMessage({
      type: 'warning',
      message: 'Nothing to export — write or load a song first.',
      timestamp: new Date(),
      source: 'export',
    });
    deps.showProblems();
    return;
  }

  try {
    parse(source);
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    deps.problemsPanel.addMessage({
      type: 'error',
      message: `Cannot export — fix song errors first: ${msg}`,
      timestamp: new Date(),
      source: 'export',
    });
    deps.showProblems();
    return;
  }

  const result = await deps.exportManager.export(source, format, { filename: deps.getFilename() });
  if (result.success) {
    deps.outputPanel.addMessage({
      type: 'success',
      message: `Exported ${result.filename} (${result.size ?? 0} bytes)`,
      timestamp: new Date(),
      source: 'export',
    });
    deps.showOutput();
    if (result.warnings?.length) {
      for (const warning of result.warnings) {
        deps.problemsPanel.addMessage({
          type: 'warning',
          message: warning,
          timestamp: new Date(),
          source: 'export',
        });
      }
      deps.showProblems();
    }
  } else if (result.cancelled) {
    return;
  } else {
    deps.problemsPanel.addMessage({
      type: 'error',
      message: `Export failed: ${result.error?.message ?? 'unknown error'}`,
      timestamp: new Date(),
      source: 'export',
    });
    deps.showProblems();
  }
}

/**
 * Return export data as plain text for clipboard operations (F1 → Export: Clipboard…).
 * Supported clipboard formats are text-only (.bax, JSON, FamiTracker text).
 *
 * Import kits are merged the same way as {@link ExportManager.export} so local
 * imports (e.g. `local: kits`) resolve via the open document path / Electron FS.
 */
export async function handleDesktopExportData(
  format: ExportFormat,
  getSource: () => string,
): Promise<string | null> {
  const source = getSource();
  if (!source.trim()) return null;
  try {
    if (format === 'bax') {
      return source;
    }

    // Match ExportManager: merge kits before resolveSong. Desktop/web
    // resolveSong uses the browser bundle, where resolveImportsSync always throws.
    let ast: any = parse(source);
    if (Array.isArray(ast.imports) && ast.imports.length > 0) {
      ast = await resolveImports(ast, buildImportResolverOptions());
    }
    const resolved = resolveSong(ast, {});

    if (format === 'json') {
      return JSON.stringify(resolved, null, 2);
    }

    if (format === 'famitracker-text' || format === 'famitracker') {
      const plugin = exporterRegistry.get('famitracker-text');
      if (!plugin) return null;

      if (typeof plugin.validate === 'function') {
        const errors = plugin.validate(resolved as any);
        if (Array.isArray(errors) && errors.length > 0) {
          return null;
        }
      }

      const chipId = String((resolved as any)?.chip ?? '').toLowerCase();
      const chipPlugin = chipId ? chipRegistry.get(chipId) : undefined;
      const data = await plugin.export(resolved as any, {
        resolveSampleAsset: typeof chipPlugin?.resolveSampleAsset === 'function'
          ? (ref: string) => chipPlugin.resolveSampleAsset!(ref)
          : undefined,
      });

      if (typeof data === 'string') return data;
      if (data instanceof Uint8Array) {
        return new TextDecoder('utf-8').decode(data);
      }
      if (data instanceof ArrayBuffer) {
        return new TextDecoder('utf-8').decode(new Uint8Array(data));
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}
