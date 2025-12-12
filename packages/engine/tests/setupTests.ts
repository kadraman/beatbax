// Jest setup file: mute console output during tests by default.
// Set environment variable SHOW_CONSOLE=1 to see logs while running tests.

if (!process.env.SHOW_CONSOLE) {
  const methods: (keyof Console)[] = ['log', 'info', 'warn', 'debug', 'error'];
  methods.forEach((m) => {
    // jest.spyOn is available in the test environment
    // use a no-op implementation so tests don't show noisy logs
    // @ts-ignore
    jest.spyOn(console, m).mockImplementation(() => {});
  });
}
