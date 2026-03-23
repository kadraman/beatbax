import * as monaco from 'monaco-editor';
import type { EventBus } from '../utils/event-bus';

function injectBeatStyles() {
  if (document.getElementById('bb-beat-styles')) return;
  const style = document.createElement('style');
  style.id = 'bb-beat-styles';
  style.textContent = `
    .bb-beat-downbeat {
      background-color: var(--beat-downbeat-bg, rgba(255, 255, 255, 0.15));
      border-radius: 2px;
    }
    .bb-beat-upbeat {
      background-color: var(--beat-upbeat-bg, rgba(255, 255, 255, 0.05));
      border-radius: 2px;
    }
    [data-theme="light"] .bb-beat-downbeat {
      --beat-downbeat-bg: rgba(0, 0, 0, 0.15);
    }
    [data-theme="light"] .bb-beat-upbeat {
      --beat-upbeat-bg: rgba(0, 0, 0, 0.05);
    }
  `;
  document.head.appendChild(style);
}

export function setupBeatDecorations(
  monacoEditor: monaco.editor.IStandaloneCodeEditor,
  eventBus: EventBus
): () => void {
  injectBeatStyles();

  let decorationIds: string[] = [];

  const unsubParse = eventBus.on('parse:success', ({ ast }: { ast: any }) => {
    if (!ast || !ast.patternEvents) return;

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    const stepsPerBeat = 4; // Assume 4 steps per beat as standard for typical 16-step patterns

    for (const patName of Object.keys(ast.patternEvents)) {
      const events = ast.patternEvents[patName];
      let stepCounter = 0;

      for (const event of events) {
        // Only notes and rests take up time steps
        if (event.kind === 'note' || event.kind === 'rest') {
          const duration = event.duration || 1;

          let className = '';
          if (stepCounter % stepsPerBeat === 0) {
            className = 'bb-beat-downbeat';
          } else if (stepCounter % 2 === 0) { // e.g. step 2, 6, 10
            className = 'bb-beat-upbeat';
          }

          if (className && event.loc) {
            // loc is 1-based, Monaco requires 1-based
            // loc.start.column and loc.end.column are 1-based char indices
            decorations.push({
              range: new monaco.Range(
                event.loc.start.line,
                event.loc.start.column,
                event.loc.end.line,
                event.loc.end.column
              ),
              options: {
                inlineClassName: className
              }
            });
          }

          stepCounter += duration;
        }
      }
    }

    decorationIds = monacoEditor.deltaDecorations(decorationIds, decorations);
  });

  return () => {
    unsubParse();
    if (decorationIds.length > 0) {
      monacoEditor.deltaDecorations(decorationIds, []);
    }
  };
}
