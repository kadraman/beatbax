describe('chevrotain synchronous parse', () => {
  let prev: string | undefined;
  beforeAll(() => {
    prev = process.env.BEATBAX_PARSER;
    process.env.BEATBAX_PARSER = 'chevrotain';
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.BEATBAX_PARSER;
    else process.env.BEATBAX_PARSER = prev;
  });

  test('parse() returns AST synchronously when chevrotain flag is set', () => {
    jest.isolateModules(() => {
      jest.resetModules();
      // Provide a synchronous mock implementation of the chevrotain parser module
      jest.mock('../src/parser/chevrotain/index.js', () => ({
        parseWithChevrotainSync: (input: string) => ({
          errors: [],
          ast: { pats: { melody: ['C5', 'E5', 'G5'] } },
        }),
      }), { virtual: true });

      // Import the parser after mocking
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { parse } = require('../src/parser/index.js');

      const src = `
        pat melody = C5 E5 G5
        inst lead type=pulse1
        seq main = melody
        channel 1 => seq main
      `;

      const res = parse(src);
      expect(res).toHaveProperty('pats');
      expect(res.pats).toHaveProperty('melody');
      expect(res.pats.melody).toEqual(expect.arrayContaining(['C5', 'E5', 'G5']));
    });
  });
});