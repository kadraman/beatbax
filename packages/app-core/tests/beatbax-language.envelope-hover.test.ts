import * as monaco from 'monaco-editor';
import {
  parseEnvelopeAtPosition,
  simulateGBEnvelope,
  renderEnvelopeSparkline,
} from '../src/editor/beatbax-language';
import { registerBeatBaxLanguage } from '../src/editor/beatbax-language';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeModel(line: string) {
  return {
    getLineContent: jest.fn(() => line),
    getWordAtPosition: jest.fn(() => null),
  } as any as monaco.editor.ITextModel;
}

function pos(col: number) {
  return { lineNumber: 1, column: col } as monaco.IPosition;
}

function colOf(line: string, substr: string, offset = 0) {
  return line.indexOf(substr) + offset + 1; // 1-based
}

// ── parseEnvelopeAtPosition ───────────────────────────────────────────────────

describe('parseEnvelopeAtPosition', () => {
  describe('JSON form', () => {
    const line = 'inst p type=pulse2 duty=50 env={"level":12,"direction":"down","period":1,"format":"gb"}';

    it('detects envelope when cursor is on level value', () => {
      const col = colOf(line, '12');
      const result = parseEnvelopeAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.level).toBe(12);
      expect(result!.direction).toBe('down');
      expect(result!.period).toBe(1);
    });

    it('detects envelope when cursor is on direction string', () => {
      const col = colOf(line, 'down');
      const result = parseEnvelopeAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('down');
    });

    it('returns null when cursor is before the env= token', () => {
      const result = parseEnvelopeAtPosition(makeModel(line), pos(1));
      expect(result).toBeNull();
    });
  });

  describe('gb-prefixed form', () => {
    const line = 'inst p type=pulse1 duty=50 env=gb:15,down,2';

    it('parses level, direction, period', () => {
      const col = colOf(line, 'gb:15');
      const result = parseEnvelopeAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.level).toBe(15);
      expect(result!.direction).toBe('down');
      expect(result!.period).toBe(2);
    });
  });

  describe('short form', () => {
    it('parses level + direction + optional period', () => {
      const line = 'inst p type=pulse1 duty=50 env=10,up,3';
      const col = colOf(line, '10,up,3');
      const result = parseEnvelopeAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.level).toBe(10);
      expect(result!.direction).toBe('up');
      expect(result!.period).toBe(3);
    });

    it('defaults period to 0 when omitted', () => {
      const line = 'inst p type=pulse1 env=8,down';
      const col = colOf(line, '8,down');
      const result = parseEnvelopeAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.period).toBe(0);
    });

    it('handles flat direction', () => {
      const line = 'inst p type=pulse1 env=15,flat';
      const col = colOf(line, 'flat');
      const result = parseEnvelopeAtPosition(makeModel(line), pos(col));
      expect(result).not.toBeNull();
      expect(result!.direction).toBe('flat');
    });
  });
});

// ── simulateGBEnvelope ────────────────────────────────────────────────────────

describe('simulateGBEnvelope', () => {
  it('starts at initial level', () => {
    const env = { level: 12, direction: 'down' as const, period: 2, raw: '', range: {} as any };
    const steps = simulateGBEnvelope(env, 5);
    expect(steps[0]).toBe(12);
  });

  it('decrements every period steps (down direction)', () => {
    const env = { level: 4, direction: 'down' as const, period: 2, raw: '', range: {} as any };
    const steps = simulateGBEnvelope(env, 6);
    // step 0: 4, step 1: 4, step 2: 3, step 3: 3, step 4: 2, step 5: 2
    expect(steps).toEqual([4, 4, 3, 3, 2, 2]);
  });

  it('increments every period steps (up direction)', () => {
    const env = { level: 13, direction: 'up' as const, period: 1, raw: '', range: {} as any };
    const steps = simulateGBEnvelope(env, 4);
    expect(steps).toEqual([13, 14, 15, 15]);
  });

  it('holds flat when direction is flat', () => {
    const env = { level: 8, direction: 'flat' as const, period: 1, raw: '', range: {} as any };
    const steps = simulateGBEnvelope(env, 4);
    expect(steps).toEqual([8, 8, 8, 8]);
  });

  it('holds constant when period is 0', () => {
    const env = { level: 10, direction: 'down' as const, period: 0, raw: '', range: {} as any };
    const steps = simulateGBEnvelope(env, 4);
    expect(steps).toEqual([10, 10, 10, 10]);
  });

  it('clamps output at 0 (never negative)', () => {
    const env = { level: 1, direction: 'down' as const, period: 1, raw: '', range: {} as any };
    const steps = simulateGBEnvelope(env, 5);
    expect(steps.every((v) => v >= 0)).toBe(true);
    expect(steps[2]).toBe(0);
  });

  it('clamps output at 15 (never above max)', () => {
    const env = { level: 14, direction: 'up' as const, period: 1, raw: '', range: {} as any };
    const steps = simulateGBEnvelope(env, 5);
    expect(steps.every((v) => v <= 15)).toBe(true);
    expect(steps[2]).toBe(15);
  });
});

// ── renderEnvelopeSparkline ───────────────────────────────────────────────────

describe('renderEnvelopeSparkline', () => {
  it('returns string with same length as input', () => {
    const line = renderEnvelopeSparkline([0, 4, 8, 12, 15]);
    expect(line).toHaveLength(5);
  });

  it('renders 0 as a space character', () => {
    const line = renderEnvelopeSparkline([0]);
    expect(line).toBe(' ');
  });

  it('renders 15 as full block █', () => {
    const line = renderEnvelopeSparkline([15]);
    expect(line).toBe('█');
  });

  it('renders a falling envelope visually', () => {
    const line = renderEnvelopeSparkline([15, 12, 9, 6, 3, 0]);
    // Each subsequent character should encode a lower or equal block height
    const chars = ' ▁▂▃▄▅▆▇█';
    const indices = [...line].map((c) => chars.indexOf(c));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeLessThanOrEqual(indices[i - 1]);
    }
  });
});

// ── provideHover integration ──────────────────────────────────────────────────

describe('provideHover — envelope hover', () => {
  beforeEach(() => jest.clearAllMocks());

  function getHoverProvider() {
    registerBeatBaxLanguage();
    const call = (monaco.languages.registerHoverProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );
    expect(call).toBeDefined();
    return call?.[1];
  }

  it('returns envelope hover for JSON env= value', () => {
    const provider = getHoverProvider();
    const line = 'inst p type=pulse2 duty=50 env={"level":15,"direction":"down","period":1,"format":"gb"}';
    const col = line.indexOf('"level"') + 4; // cursor inside JSON object

    const model = makeModel(line);
    const hover = provider.provideHover(model, pos(col));

    expect(hover).not.toBeNull();
    expect(hover.contents[0].value).toContain('Envelope preview');
    expect(hover.contents[1].value).toContain('```text');
    expect(hover.contents[2].value).toContain('Initial level');
    expect(hover.contents[2].value).toContain('15');
    expect(hover.contents[2].value).toContain('down');
  });

  it('returns envelope hover for short form env=', () => {
    const provider = getHoverProvider();
    const line = 'inst p type=pulse1 env=12,down,1';
    const col = colOf(line, '12,down');

    const model = makeModel(line);
    const hover = provider.provideHover(model, pos(col));

    expect(hover).not.toBeNull();
    expect(hover.contents[0].value).toContain('Envelope preview');
  });
});
