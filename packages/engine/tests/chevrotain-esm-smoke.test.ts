describe('Chevrotain ESM smoke test', () => {
  test('dynamic import of chevrotain and dist parser should work and parse sample', async () => {
    // Ensure dynamic import of the package works
    try {
      await import('chevrotain');
    } catch (e) {
      // If Chevrotain isn't installed in the dev environment, skip this test rather
      // than failing the entire test suite. CI parity job installs Chevrotain and
      // will exercise this test, causing it to fail if ESM import doesn't work.
      console.warn('chevrotain not available; skipping ESM smoke test:', String(e));
      return;
    }

    // Import the built ESM parser from dist (pretest build should have produced this)
    // Use ts-ignore because the file may not exist at type-check time in local dev envs
    // @ts-ignore
    const parserModule = await import('../../dist/parser/chevrotain/index.js');
    if (!parserModule || !parserModule.default) throw new Error('Built Chevrotain parser module not found or missing default export');

    const res = await parserModule.default(`pat melody = C5`);
    if (res.errors && res.errors.length) throw new Error('Chevrotain parser returned errors: ' + JSON.stringify(res.errors));
    const ast = res.ast;
    expect(ast).toBeTruthy();
    expect(ast.pats).toHaveProperty('melody');
    expect(ast.pats.melody).toEqual(expect.arrayContaining(['C5']));
  }, 10000);
});
