import { parseWithPeggy } from '../src/parser/peggy/index.js';
import { resolveSong } from '../src/song/resolver.js';

const preamble = `chip gameboy
bpm 120
inst lead type=pulse1
inst arp type=pulse2
inst bass type=wave volume=100 wave=0123456789ABCDEFFEDCBA9876543210
inst kick type=noise
pat mel_a = C4 E4
pat harm_a = E4 G4
pat bass_a = C3 C3
pat drum_a = C4 .
pat mel_b = D4 F4
pat harm_b = F4 A4
pat bass_b = D3 D3
pat drum_b = . C4
`;

describe('composition Phase 2: section + form + role', () => {
  it('expands section roles to named seqs and form+role channels', () => {
    const src = `${preamble}
section intro {
  mel = mel_a
  harm = harm_a
  bass = bass_a
  perc = drum_a
}
section hook {
  mel = mel_b
  harm = harm_b
  bass = bass_b
  perc = drum_b
}
form main = intro, hook
channel 1 => inst lead role mel form main
channel 2 => inst arp role harm form main
channel 3 => inst bass role bass form main
channel 4 => inst kick role perc form main
`;
    const { ast, hasErrors } = parseWithPeggy(src);
    expect(hasErrors).toBe(false);
    expect(ast.diagnostics?.filter((d) => d.level === 'error') || []).toEqual([]);
    expect(ast.seqs.intro_mel).toEqual(['mel_a']);
    expect(ast.seqs.hook_perc).toEqual(['drum_b']);
    expect(String(ast.channels[0].pat).split(/\s+/)).toEqual(['intro_mel', 'hook_mel']);
    expect((ast.channels[0] as { seqSpecTokens?: string[] }).seqSpecTokens).toEqual([
      'intro_mel',
      'hook_mel',
    ]);
    expect(ast.channels[0].role).toBeUndefined();
    expect(ast.sections?.intro).toBeTruthy();
    expect(ast.forms?.main.sectionNames).toEqual(['intro', 'hook']);
  });

  it('accepts Beginner Mode sugar', () => {
    const src = `${preamble}
section intro use mel_a harm_a bass_a drum_a
section hook use mel_b harm_b bass_b drum_b
form main = intro > hook
channel auto form main inst=lead|arp|bass|kick
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.filter((d) => d.level === 'error') || []).toEqual([]);
    expect(ast.channels).toHaveLength(4);
    expect(ast.channels[0].inst).toBe('lead');
    expect(String(ast.channels[0].pat)).toContain('intro_mel');
    expect(String(ast.channels[3].pat)).toContain('hook_perc');
  });

  it('accepts NES Beginner Mode with 5 lanes including dmc', () => {
    const src = `chip nes
bpm 120
inst lead type=pulse1
inst harm type=pulse2
inst tri type=triangle
inst kick type=noise
inst kick_dmc type=dmc
pat mel_a = C4
pat harm_a = E4
pat bass_a = C3
pat drum_a = C4
pat dmc_a = C4
pat mel_b = D4
pat harm_b = F4
pat bass_b = D3
pat drum_b = . C4
pat dmc_b = D4
section intro use mel_a harm_a bass_a drum_a dmc_a
section hook use mel_b harm_b bass_b drum_b dmc_b
form main = intro > hook
channel auto form main inst=lead|harm|tri|kick|kick_dmc
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.filter((d) => d.level === 'error') || []).toEqual([]);
    expect(ast.channels).toHaveLength(5);
    expect(ast.channels[4].inst).toBe('kick_dmc');
    expect(ast.seqs.intro_dmc).toEqual(['dmc_a']);
    expect(String(ast.channels[4].pat).split(/\s+/)).toEqual(['intro_dmc', 'hook_dmc']);
  });

  it('accepts NES Beginner Mode with 4 lanes (no DMC)', () => {
    const src = `chip nes
bpm 120
inst lead type=pulse1
inst harm type=pulse2
inst tri type=triangle
inst kick type=noise
pat mel_a = C4
pat harm_a = E4
pat bass_a = C3
pat drum_a = C4
section intro use mel_a harm_a bass_a drum_a
form main = intro
channel auto form main inst=lead|harm|tri|kick
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.filter((d) => d.level === 'error') || []).toEqual([]);
    expect(ast.channels).toHaveLength(4);
    expect(ast.seqs.intro_dmc).toBeUndefined();
  });

  it('errors on unsupported Beginner arity for NES', () => {
    const src = `chip nes
bpm 120
inst lead type=pulse1
inst harm type=pulse2
inst tri type=triangle
pat mel_a = C4
pat harm_a = E4
pat bass_a = C3
section intro use mel_a harm_a bass_a
form main = intro
channel auto form main inst=lead|harm|tri
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.some((d) => /unsupported for chip 'nes'/i.test(d.message))).toBe(true);
  });

  it('errors when Beginner section use arity differs across sections', () => {
    const src = `chip nes
bpm 120
inst lead type=pulse1
inst harm type=pulse2
inst tri type=triangle
inst kick type=noise
inst kick_dmc type=dmc
pat mel_a = C4
pat harm_a = E4
pat bass_a = C3
pat drum_a = C4
pat dmc_a = C4
section intro use mel_a harm_a bass_a drum_a
section hook use mel_a harm_a bass_a drum_a dmc_a
form main = intro > hook
channel auto form main inst=lead|harm|tri|kick
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.some((d) => /same lane count/i.test(d.message))).toBe(true);
  });

  it('errors when a section omits a required role', () => {
    const src = `${preamble}
section intro {
  mel = mel_a
  harm = harm_a
  bass = bass_a
}
form main = intro
channel 1 => inst lead role mel form main
channel 4 => inst kick role perc form main
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.some((d) => /does not define that role/i.test(d.message))).toBe(true);
  });

  it('errors on generated name collision with explicit seq', () => {
    const src = `${preamble}
seq intro_mel = mel_a
section intro {
  mel = mel_b
  harm = harm_a
  bass = bass_a
  perc = drum_a
}
form main = intro
channel 1 => inst lead role mel form main
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.some((d) => /collides with an explicit or generated seq/i.test(d.message))).toBe(true);
  });

  it('resolves equivalently to hand-written channel seq lists', () => {
    const composed = `${preamble}
section intro {
  mel = mel_a
  harm = harm_a
  bass = bass_a
  perc = drum_a
}
section hook {
  mel = mel_b
  harm = harm_b
  bass = bass_b
  perc = drum_b
}
form main = intro, hook
channel 1 => inst lead role mel form main
channel 2 => inst arp role harm form main
channel 3 => inst bass role bass form main
channel 4 => inst kick role perc form main
`;
    const manual = `${preamble}
seq intro_mel = mel_a
seq intro_harm = harm_a
seq intro_bass = bass_a
seq intro_perc = drum_a
seq hook_mel = mel_b
seq hook_harm = harm_b
seq hook_bass = bass_b
seq hook_perc = drum_b
channel 1 => inst lead seq intro_mel hook_mel
channel 2 => inst arp seq intro_harm hook_harm
channel 3 => inst bass seq intro_bass hook_bass
channel 4 => inst kick seq intro_perc hook_perc
`;
    const a = parseWithPeggy(composed).ast;
    const b = parseWithPeggy(manual).ast;
    const ra = resolveSong(a);
    const rb = resolveSong(b);
    const count = (song: typeof ra) =>
      song.channels.reduce((n, ch) => n + (ch.events?.length || 0), 0);
    expect(count(ra)).toBe(count(rb));
  });
});
