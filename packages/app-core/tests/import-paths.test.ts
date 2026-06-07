import * as monaco from 'monaco-editor';
import {
  buildImportPathCompletionItems,
  collectImportPathCandidates,
  filterImportPathsByPrefix,
  getImportPathPartial,
  isImportPathPosition,
  parseImportPathsFromSource,
} from '../src/editor/import-paths';

describe('import path completion helpers', () => {
  test('parseImportPathsFromSource extracts quoted paths', () => {
    const source = [
      'import "local:lib/kicks.ins"',
      'import "github:user/repo/drums.ins"',
    ].join('\n');
    expect(parseImportPathsFromSource(source)).toEqual([
      'local:lib/kicks.ins',
      'github:user/repo/drums.ins',
    ]);
  });

  test('isImportPathPosition works without "from" and with unclosed quote', () => {
    const line = 'import "local:lib/';
    const col = line.length;
    expect(isImportPathPosition(line, col)).toBe(true);
    expect(isImportPathPosition('chip gameboy', 6)).toBe(false);
  });

  test('getImportPathPartial reads typed path inside quotes', () => {
    const line = 'import "local:lib/';
    expect(getImportPathPartial(line, line.length)).toBe('local:lib/');
  });

  test('filterImportPathsByPrefix matches directory prefixes', () => {
    const all = collectImportPathCandidates('');
    const matches = filterImportPathsByPrefix(all, 'local:lib/');
    expect(matches.some((p) => p.includes('local:lib/'))).toBe(true);
  });

  test('buildImportPathCompletionItems lists paths for local:lib/ prefix', () => {
    const line = 'import "local:lib/';
    const items = buildImportPathCompletionItems('', line, { lineNumber: 1, column: line.length });
    const labels = items.map((i) => String(i.label));
    expect(labels.some((l) => l.startsWith('local:lib/'))).toBe(true);
    expect(labels).not.toContain('(no files found)');
  });

  test('buildImportPathCompletionItems shows no files found when nothing matches', () => {
    const line = 'import "local:zzz/nonexistent/';
    const items = buildImportPathCompletionItems('', line, { lineNumber: 1, column: line.length });
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('(no files found)');
  });

  test('completion items include filterText for monaco matching', () => {
    const line = 'import "github:';
    const items = buildImportPathCompletionItems('', line, { lineNumber: 1, column: line.length });
    const gh = items.find((i) => String(i.label).startsWith('github:'));
    expect(gh?.filterText).toBeTruthy();
  });
});
