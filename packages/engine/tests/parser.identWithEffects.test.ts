/**
 * Test for IdentWithEffects grammar rule
 *
 * This rule handles identifiers with effect suffixes like: myId<arp:3,7>
 * While not a documented feature (all current uses apply effects to notes),
 * the grammar rule should correctly reconstruct tokens with angle brackets.
 */

import { parseWithPeggy } from '../src/parser/peggy';

describe('IdentWithEffects grammar rule', () => {
  test('reconstructs identifier with single effect correctly', () => {
    const src = 'pat test = myId<arp:3,7>\nchannel 1 => inst lead pat test';
    const ast = parseWithPeggy(src);

    // Check the patternEvents structured output
    expect(ast.patternEvents?.test).toBeDefined();
    expect(ast.patternEvents!.test).toHaveLength(1);

    const token = ast.patternEvents!.test[0] as any;
    expect(token.kind).toBe('token');
    // Should reconstruct with angle brackets: myId<arp:3,7>
    expect(token.value).toBe('myId<arp:3,7>');
    expect(token.raw).toBe('myId<arp:3,7>');
  });

  test('reconstructs identifier with multiple effects correctly', () => {
    const src = 'pat test = myId<pan:L><vib:4>\nchannel 1 => inst lead pat test';
    const ast = parseWithPeggy(src);

    const token = ast.patternEvents!.test[0] as any;

    expect(token.kind).toBe('token');
    // Should reconstruct with angle brackets: myId<pan:L><vib:4>
    expect(token.value).toBe('myId<pan:L><vib:4>');
    expect(token.raw).toBe('myId<pan:L><vib:4>');
  });

  test('note with effects uses separate effects array', () => {
    // Notes with effects should have effects array, not concatenated
    const src = 'pat test = C4<arp:3,7>\nchannel 1 => inst lead pat test';
    const ast = parseWithPeggy(src);

    const note = ast.patternEvents!.test[0] as any;

    expect(note.kind).toBe('note');
    expect(note.value).toBe('C4');
    expect(note.effects).toEqual(['arp:3,7']);
    // Raw should include angle brackets
    expect(note.raw).toBe('C4<arp:3,7>');
  });

  test('note with multiple effects has correct effects array', () => {
    const src = 'pat test = C4<pan:L><vib:4,6>\nchannel 1 => inst lead pat test';
    const ast = parseWithPeggy(src);

    const note = ast.patternEvents!.test[0] as any;

    expect(note.kind).toBe('note');
    expect(note.value).toBe('C4');
    expect(note.effects).toEqual(['pan:L', 'vib:4,6']);
    expect(note.raw).toBe('C4<pan:L><vib:4,6>');
  });

  test('plain identifier without effects works correctly', () => {
    const src = 'pat test = myId\nchannel 1 => inst lead pat test';
    const ast = parseWithPeggy(src);

    const token = ast.patternEvents!.test[0] as any;

    expect(token.kind).toBe('token');
    expect(token.value).toBe('myId');
    expect(token.raw).toBe('myId');
    expect(token).not.toHaveProperty('effects');
  });

  test('complex effect parameters are preserved correctly', () => {
    const src = 'pat test = myId<vib:3,5,sine,4>\nchannel 1 => inst lead pat test';
    const ast = parseWithPeggy(src);

    const token = ast.patternEvents!.test[0] as any;

    expect(token.kind).toBe('token');
    expect(token.value).toBe('myId<vib:3,5,sine,4>');
    expect(token.raw).toBe('myId<vib:3,5,sine,4>');
  });

  test('effect with namespace is reconstructed correctly', () => {
    const src = 'pat test = myId<gb:pan:R>\nchannel 1 => inst lead pat test';
    const ast = parseWithPeggy(src);

    const token = ast.patternEvents!.test[0] as any;

    expect(token.kind).toBe('token');
    expect(token.value).toBe('myId<gb:pan:R>');
    expect(token.raw).toBe('myId<gb:pan:R>');
  });
});
