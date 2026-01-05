import { parseWithPeggy } from '../src/parser/peggy';

describe('Peggy CSV normalization for instrument properties', () => {
  // Peggy is the only supported parser now; parser selection via
  // `BEATBAX_PARSER` is removed. Enable the normalization feature
  // explicitly for these tests and clean it up after.
  beforeAll(() => {
    process.env.BEATBAX_PEGGY_NORMALIZE_INST_PROPS = '1';
  });

  afterAll(() => {
    delete process.env.BEATBAX_PEGGY_NORMALIZE_INST_PROPS;
  });

  test('parses CSV env and noise into structured objects and warns once', () => {
    const src = `
chip gameboy
inst bass type=pulse2 duty=25 env=10,down,7
inst n type=noise noise=3,7,2
`;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ast = parseWithPeggy(src);

    expect(ast.insts.bass).toBeDefined();
    expect(ast.insts.bass.env).toMatchObject({ level: 10, direction: 'down', period: 7 });

    expect(ast.insts.n).toBeDefined();
    // noise normalization produces object with clockShift/widthMode/divisor
    expect(ast.insts.n.noise).toMatchObject({ clockShift: 3, widthMode: 7, divisor: 2 });

    // Parser should warn at least once per parse run about deprecated CSV normalization
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('accepts structured env literal without deprecation warning', () => {
    const src = `
chip gameboy
inst lead type=pulse1 duty=50 env={"level":15,"direction":"up","period":3}
`;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ast = parseWithPeggy(src);

    expect(ast.insts.lead).toBeDefined();
    expect(ast.insts.lead.env).toMatchObject({ level: 15, direction: 'up', period: 3 });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
