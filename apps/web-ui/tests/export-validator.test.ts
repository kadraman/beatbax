/**
 * Unit tests for ExportValidator
 */

import { validateForExport } from '../src/export/export-validator';

// ─── Helpers ────────────────────────────────────────────────────────────────

function validAst(overrides: Record<string, any> = {}) {
  return {
    channels: [
      { id: 1, inst: 'lead' },
      { id: 2, inst: 'bass' },
    ],
    insts: {
      lead: { type: 'pulse1', duty: 50 },
      bass: { type: 'pulse2', duty: 25 },
    },
    pats: { melody: {} },
    seqs: { main: {} },
    ...overrides,
  };
}

// ─── Generic validation ──────────────────────────────────────────────────────

describe('validateForExport — generic', () => {
  it('returns valid:true for a well-formed AST', () => {
    const result = validateForExport(validAst());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid:false when AST is null', () => {
    const result = validateForExport(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/No song loaded/i);
  });

  it('returns valid:false when AST is not an object', () => {
    const result = validateForExport('not an object' as any);
    expect(result.valid).toBe(false);
  });

  it('reports an error when channels are missing', () => {
    const result = validateForExport(validAst({ channels: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /no channels/i.test(e.message))).toBe(true);
  });

  it('reports an error when channels key is absent', () => {
    const ast = validAst();
    delete (ast as any).channels;
    const result = validateForExport(ast);
    expect(result.valid).toBe(false);
  });

  it('reports a warning when no instruments are defined', () => {
    const result = validateForExport(validAst({ insts: {} }));
    expect(result.warnings.some(w => /no instrument/i.test(w.message))).toBe(true);
  });

  it('reports a warning when no patterns or sequences are defined', () => {
    const result = validateForExport(validAst({ pats: {}, seqs: {} }));
    expect(result.warnings.some(w => /no patterns or sequences/i.test(w.message))).toBe(true);
  });

  it('reports an error when a channel references an undefined instrument', () => {
    const ast = validAst({
      channels: [{ id: 1, inst: 'ghost' }],
    });
    const result = validateForExport(ast);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /ghost/.test(e.message))).toBe(true);
  });

  it('result.issues contains both errors and warnings combined', () => {
    // Missing channels (error) + missing insts (warning)
    const result = validateForExport({ channels: [], insts: {}, pats: {}, seqs: {} });
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
    expect(result.issues).toEqual(expect.arrayContaining(result.errors));
    expect(result.issues).toEqual(expect.arrayContaining(result.warnings));
  });
});

// ─── UGE-specific validation ─────────────────────────────────────────────────

describe('validateForExport — uge format', () => {
  it('passes cleanly for a standard 4-channel Game Boy song', () => {
    const result = validateForExport(validAst(), 'uge');
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when duty instrument count exceeds 15', () => {
    const insts: Record<string, any> = {};
    for (let i = 0; i < 16; i++) insts[`p${i}`] = { type: 'pulse1' };
    const ast = validAst({ insts, channels: [{ id: 1, inst: 'p0' }] });
    const result = validateForExport(ast, 'uge');
    expect(result.warnings.some(w => /duty/.test(w.message) && /15/.test(w.message))).toBe(true);
  });

  it('warns when wave instrument count exceeds 15', () => {
    const insts: Record<string, any> = {};
    for (let i = 0; i < 16; i++) insts[`w${i}`] = { type: 'wave' };
    const ast = validAst({ insts, channels: [{ id: 1, inst: 'w0' }] });
    const result = validateForExport(ast, 'uge');
    expect(result.warnings.some(w => /wave/.test(w.message) && /15/.test(w.message))).toBe(true);
  });

  it('warns when noise instrument count exceeds 15', () => {
    const insts: Record<string, any> = {};
    for (let i = 0; i < 16; i++) insts[`n${i}`] = { type: 'noise' };
    const ast = validAst({ insts, channels: [{ id: 1, inst: 'n0' }] });
    const result = validateForExport(ast, 'uge');
    expect(result.warnings.some(w => /noise/.test(w.message) && /15/.test(w.message))).toBe(true);
  });

  it('warns when more than 4 channels are defined', () => {
    const channels = [1, 2, 3, 4, 5].map(id => ({ id, inst: 'lead' }));
    const result = validateForExport(validAst({ channels }), 'uge');
    expect(result.warnings.some(w => /5 channels/.test(w.message) && /4/.test(w.message))).toBe(true);
  });

  it('does not warn for exactly 4 channels', () => {
    const channels = [1, 2, 3, 4].map(id => ({ id, inst: 'lead' }));
    const result = validateForExport(validAst({ channels }), 'uge');
    expect(result.warnings.some(w => /channels/.test(w.message))).toBe(false);
  });
});

// ─── MIDI-specific validation ─────────────────────────────────────────────────

describe('validateForExport — midi format', () => {
  it('passes cleanly for a standard song', () => {
    const result = validateForExport(validAst(), 'midi');
    expect(result.valid).toBe(true);
  });

  it('warns when more than 16 channels are present', () => {
    const channels = Array.from({ length: 17 }, (_, i) => ({ id: i + 1, inst: 'lead' }));
    const result = validateForExport(validAst({ channels }), 'midi');
    expect(result.warnings.some(w => /17 channels/.test(w.message) && /16/.test(w.message))).toBe(true);
  });

  it('provides an info notice when noise channels are present', () => {
    const ast = validAst({
      channels: [{ id: 1, inst: 'kick' }],
      insts: { kick: { type: 'noise' } },
    });
    const result = validateForExport(ast, 'midi');
    expect(result.issues.some(i => i.severity === 'info' && /percussion/.test(i.message))).toBe(true);
  });

  it('does not emit the noise info when there are no noise channels', () => {
    const result = validateForExport(validAst(), 'midi');
    expect(result.issues.some(i => i.severity === 'info' && /percussion/.test(i.message))).toBe(false);
  });
});
