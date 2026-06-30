import { parse } from '@beatbax/engine/parser';
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
