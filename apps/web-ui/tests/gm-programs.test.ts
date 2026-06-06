import * as monaco from 'monaco-editor';
import {
  buildGmHoverMarkdown,
  getGmProgramName,
  parseGmAtPosition,
} from '../src/editor/gm-programs';
import { registerBeatBaxLanguage } from '../src/editor/beatbax-language';

describe('GM program helpers', () => {
  test('getGmProgramName returns standard patch names', () => {
    expect(getGmProgramName(80)).toBe('Lead 1 (square)');
    expect(getGmProgramName(81)).toBe('Lead 2 (sawtooth)');
    expect(getGmProgramName(34)).toBe('Electric Bass (pick)');
    expect(getGmProgramName(128)).toBeNull();
    expect(getGmProgramName(-1)).toBeNull();
  });

  test('buildGmHoverMarkdown includes family and export note', () => {
    const md = buildGmHoverMarkdown(81);
    expect(md).toContain('Lead 2 (sawtooth)');
    expect(md).toContain('Synth Lead');
    expect(md).toContain('MIDI export');
  });

  test('parseGmAtPosition matches gm= on inst lines only', () => {
    const line = 'inst melody type=pulse1 duty=50 env={"level":12,"direction":"down","period":1,"format":"gb"} gm=81';
    const gmColumn = line.indexOf('81') + 1;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    expect(parseGmAtPosition(model, { lineNumber: 1, column: gmColumn })?.program).toBe(81);

    const seqModel = {
      getLineContent: jest.fn(() => 'seq demo = pat:gm=81'),
    } as unknown as monaco.editor.ITextModel;
    expect(parseGmAtPosition(seqModel, { lineNumber: 1, column: 14 })).toBeNull();
  });
});

describe('BeatBax Monaco hover provider — gm=', () => {
  function getHoverProvider() {
    registerBeatBaxLanguage();
    const call = (monaco.languages.registerHoverProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );
    expect(call).toBeDefined();
    return call?.[1];
  }

  test('shows GM patch name when hovering gm= value on inst line', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst lead type=pulse1 duty=50 gm=81';
    const column = line.indexOf('81') + 1;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => null),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('Lead 2 (sawtooth)');
    expect(hover.contents[0].value).toContain('Program **81**');
  });
});
