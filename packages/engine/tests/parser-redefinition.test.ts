/**
 * Spec 092: same-file redefinition of pat / seq / inst / effect warns and stays last-wins.
 */
import { parse } from '../src/parser/index';
import { resolveImports } from '../src/song/importResolver.js';

const redefinitionWarnings = (src: string) =>
  (parse(src).diagnostics ?? []).filter((d) => /redefined; using the later definition\.$/.test(d.message));

describe('parser redefinition warnings (spec 092)', () => {
  test('pat redefinition warns once on the later line and keeps the later definition', () => {
    const src = [
      'chip gameboy',
      'pat melody_vib = C4 D4',
      'pat other = E4',
      'pat melody_vib = G4 A4 B4',
    ].join('\n');
    const ast = parse(src);
    const warnings = redefinitionWarnings(src);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      level: 'warning',
      component: 'parser',
      message: "pat 'melody_vib' redefined; using the later definition.",
    });
    expect(warnings[0].loc?.start.line).toBe(4);
    expect(ast.pats.melody_vib).toEqual(['G4', 'A4', 'B4']);
  });

  test.each([
    ['seq', 'pat a = C4\npat b = D4\nseq lead_seq = a\nseq lead_seq = b', "seq 'lead_seq' redefined; using the later definition."],
    ['inst', 'inst lead type=pulse1 duty=50\ninst lead type=pulse1 duty=25', "inst 'lead' redefined; using the later definition."],
    ['effect', 'effect leadVib = vib:4,6\neffect leadVib = vib:2,3', "effect 'leadVib' redefined; using the later definition."],
  ])('%s redefinition warns with its keyword', (_kind, body, message) => {
    const warnings = redefinitionWarnings(`chip gameboy\n${body}`);
    expect(warnings.map((d) => d.message)).toEqual([message]);
    expect(warnings[0].loc?.start.line).toBe(body.split('\n').length + 1);
  });

  test('later definitions win for seq, inst and effect', () => {
    const ast = parse([
      'chip gameboy',
      'pat a = C4',
      'pat b = D4',
      'seq s = a',
      'seq s = b',
      'inst lead type=pulse1 duty=50',
      'inst lead type=pulse1 duty=25',
      'effect wob = vib:4,6',
      'effect wob = vib:2,3',
    ].join('\n'));
    expect(ast.seqs.s).toEqual(['b']);
    expect(String(ast.insts.lead.duty)).toBe('25');
    expect(ast.effects?.wob).toBe('vib:2,3');
  });

  test('three definitions produce two warnings, one per later definition', () => {
    const warnings = redefinitionWarnings('chip gameboy\npat x = C4\npat x = D4\npat x = E4');
    expect(warnings).toHaveLength(2);
    expect(warnings.map((d) => d.loc?.start.line)).toEqual([3, 4]);
  });

  test('identical duplicate lines still warn', () => {
    expect(redefinitionWarnings('chip gameboy\npat x = C4\npat x = C4')).toHaveLength(1);
  });

  test('the same name across different kinds does not warn', () => {
    expect(redefinitionWarnings('chip gameboy\npat x = C4\nseq x = x\ninst x type=pulse1\neffect x = vib:4,6')).toEqual([]);
  });

  test('subpat keeps its existing warning and channel duplicates stay errors', () => {
    const subpat = parse('chip gameboy\nsubpat k =\n  -1\n  halt\nsubpat k =\n  -2\n  halt\n');
    expect((subpat.diagnostics ?? []).map((d) => d.message)).toContain("subpat 'k' redefined; using the later definition.");

    const channel = parse('chip gameboy\npat a = C4\nchannel 1 => pat a\nchannel 1 => pat a');
    const diags = channel.diagnostics ?? [];
    expect(diags.some((d) => d.level === 'error' && /Duplicate channel 1/.test(d.message))).toBe(true);
    expect(diags.some((d) => /redefined/.test(d.message))).toBe(false);
  });

  test('a local inst overriding an imported inst gets no redefinition warning', async () => {
    const files: Record<string, string> = { '/project/common.ins': 'inst lead type=pulse1 duty=50' };
    const src = 'chip gameboy\nimport "local:common.ins"\ninst lead type=pulse1 duty=75';
    const ast = parse(src);
    expect(redefinitionWarnings(src)).toEqual([]);

    const warnings: string[] = [];
    const resolved = await resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: (p: string) => {
        if (p in files) return files[p];
        throw new Error(`File not found: ${p}`);
      },
      fileExists: (p: string) => p in files,
      onWarn: (msg) => warnings.push(msg),
    });

    expect(String(resolved.insts.lead.duty)).toBe('75');
    expect(warnings.some((w) => /redefined/.test(w))).toBe(false);
    expect((resolved.diagnostics ?? []).some((d) => /redefined/.test(d.message))).toBe(false);
  });
});
