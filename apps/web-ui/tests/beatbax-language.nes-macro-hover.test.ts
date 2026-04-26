import * as monaco from 'monaco-editor';
import {
  parseNesMacroAtPosition,
  renderNesMacroSparkline,
  ParsedNesMacro,
} from '../src/editor/beatbax-language';
import { registerBeatBaxLanguage } from '../src/editor/beatbax-language';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeModel(line: string) {
  return {
    getLineContent: jest.fn(() => line),
    getWordAtPosition: jest.fn(() => null),
  } as any as monaco.editor.ITextModel;
}

function pos(col: number) {
  return { lineNumber: 1, column: col } as monaco.IPosition;
}

function colOf(line: string, substr: string, offset = 0): number {
  return line.indexOf(substr) + offset + 1; // 1-based
}

// ── parseNesMacroAtPosition ───────────────────────────────────────────────────

describe('parseNesMacroAtPosition', () => {
  describe('vol_env', () => {
    const line = 'inst i_kick type=noise noise_period=12 vol_env=[15,12,8,4,2,1]';

    it('returns macroType vol_env when cursor is inside bracket', () => {
      const col = colOf(line, '15,12');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.macroType).toBe('vol_env');
    });

    it('parses values correctly', () => {
      const col = colOf(line, '[15,12');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result!.values).toEqual([15, 12, 8, 4, 2, 1]);
    });

    it('loopPoint is -1 when no | is present', () => {
      const col = colOf(line, '15,12');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result!.loopPoint).toBe(-1);
    });

    it('returns null when cursor is before vol_env token', () => {
      const result = parseNesMacroAtPosition(makeModel(line), pos(1));
      expect(result).toBeNull();
    });
  });

  describe('vol_env with loop point', () => {
    const line = 'inst p vol_env=[1,2,3,4,5,6,7,8,9,10|9]';

    it('parses loop point correctly', () => {
      const col = colOf(line, '1,2,3');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(result!.loopPoint).toBe(9);
    });
  });

  describe('arp_env', () => {
    const line = 'inst p type=pulse1 arp_env=[0,4,7|0]';

    it('returns macroType arp_env', () => {
      const col = colOf(line, '0,4,7');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.macroType).toBe('arp_env');
    });

    it('parses values and loop point', () => {
      const col = colOf(line, '[0,4,7');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result!.values).toEqual([0, 4, 7]);
      expect(result!.loopPoint).toBe(0);
    });
  });

  describe('pitch_env', () => {
    const line = 'inst p type=pulse2 pitch_env=[5,4,3,2,1,0,0,0]';

    it('returns macroType pitch_env', () => {
      const col = colOf(line, '5,4,3');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.macroType).toBe('pitch_env');
    });

    it('parses descending pitch values', () => {
      const col = colOf(line, '[5,4');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result!.values).toEqual([5, 4, 3, 2, 1, 0, 0, 0]);
    });

    it('handles negative semitone offsets', () => {
      const line2 = 'inst p pitch_env=[0,0,-1,-2,-1,0]';
      const col = colOf(line2, '-1');
      const result = parseNesMacroAtPosition(makeModel(line2), pos(col));
      expect(result!.values).toContain(-1);
      expect(result!.values).toContain(-2);
    });
  });

  describe('duty_env', () => {
    const line = 'inst p type=pulse1 duty_env=[2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0|0]';

    it('returns macroType duty_env', () => {
      const col = colOf(line, '2,2,2');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.macroType).toBe('duty_env');
    });

    it('parses values and loop point for wah pattern', () => {
      const col = colOf(line, '[2,2,2');
      const result = parseNesMacroAtPosition(makeModel(line), pos(col));
      expect(result!.values).toHaveLength(16);
      expect(result!.loopPoint).toBe(0);
    });
  });
});

// ── renderNesMacroSparkline ───────────────────────────────────────────────────

describe('renderNesMacroSparkline', () => {
  it('returns a string with the same length as input', () => {
    const line = renderNesMacroSparkline([0, 5, 10, 15], 0, 15);
    expect(line).toHaveLength(4);
  });

  it('renders 0 at min as a space', () => {
    expect(renderNesMacroSparkline([0], 0, 15)).toBe(' ');
  });

  it('renders max as full block █', () => {
    expect(renderNesMacroSparkline([15], 0, 15)).toBe('█');
  });

  it('normalizes values relative to given min/max (non-zero min)', () => {
    // With min=0, max=7 and value=7 → should be '█'
    const line = renderNesMacroSparkline([0, 7], 0, 7);
    expect(line[1]).toBe('█');
    expect(line[0]).toBe(' ');
  });

  it('handles all same values (no range) without crashing', () => {
    const line = renderNesMacroSparkline([5, 5, 5], 5, 5);
    expect(line).toHaveLength(3);
  });

  it('renders falling vol_env visually (each char same or lower)', () => {
    const chars = ' ▁▂▃▄▅▆▇█';
    const vals = [15, 12, 8, 4, 2, 1];
    const line = renderNesMacroSparkline(vals, 0, 15);
    const indices = [...line].map((c) => chars.indexOf(c));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeLessThanOrEqual(indices[i - 1]);
    }
  });
});

// ── provideHover integration ──────────────────────────────────────────────────

describe('provideHover — NES macro hover', () => {
  beforeEach(() => jest.clearAllMocks());

  function getHoverProvider() {
    registerBeatBaxLanguage();
    const call = (monaco.languages.registerHoverProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );
    expect(call).toBeDefined();
    return call?.[1];
  }

  it('returns vol_env hover with sparkline and frame count', () => {
    const provider = getHoverProvider();
    const line = 'inst i_kick type=noise noise_period=12 vol_env=[15,12,8,4,2,1]';
    const col = colOf(line, '15,12');

    const hover = provider.provideHover(makeModel(line), pos(col));

    expect(hover).not.toBeNull();
    expect(hover.contents[0].value).toContain('Volume envelope');
    expect(hover.contents[1].value).toContain('```text');
    expect(hover.contents[2].value).toContain('Frames: **6**');
    expect(hover.contents[2].value).toContain('One-shot');
  });

  it('returns arp_env hover with semitone offsets', () => {
    const provider = getHoverProvider();
    const line = 'inst p type=pulse1 arp_env=[0,4,7|0]';
    const col = colOf(line, '0,4,7');

    const hover = provider.provideHover(makeModel(line), pos(col));

    expect(hover).not.toBeNull();
    expect(hover.contents[0].value).toContain('Arpeggio envelope');
    expect(hover.contents[2].value).toContain('+4');
    expect(hover.contents[2].value).toContain('+7');
    expect(hover.contents[2].value).toContain('Loops from index **0**');
  });

  it('returns pitch_env hover with FamiTracker unit note', () => {
    const provider = getHoverProvider();
    const line = 'inst p type=pulse2 pitch_env=[5,4,3,2,1,0,0,0]';
    const col = colOf(line, '5,4,3');

    const hover = provider.provideHover(makeModel(line), pos(col));

    expect(hover).not.toBeNull();
    expect(hover.contents[0].value).toContain('Pitch envelope');
    expect(hover.contents[2].value).toContain('multiplied by 16');
  });

  it('returns duty_env hover with duty cycle labels', () => {
    const provider = getHoverProvider();
    const line = 'inst p type=pulse1 duty_env=[0,1,2,3]';
    const col = colOf(line, '0,1,2,3');

    const hover = provider.provideHover(makeModel(line), pos(col));

    expect(hover).not.toBeNull();
    expect(hover.contents[0].value).toContain('Duty envelope');
    expect(hover.contents[2].value).toContain('12.5%');
    expect(hover.contents[2].value).toContain('25%');
    expect(hover.contents[2].value).toContain('50%');
    expect(hover.contents[2].value).toContain('75%');
  });

  it('does not fire when cursor is before the macro token', () => {
    const provider = getHoverProvider();
    const line = 'inst i_kick type=noise noise_period=12 vol_env=[15,12,8,4,2,1]';

    const hover = provider.provideHover(makeModel(line), pos(1));

    // cursor is on 'inst' keyword — mock returns null word → no hover
    expect(hover).toBeNull();
  });
});
