// Jest setup: suppress console output during tests.
if (!process.env.SHOW_CONSOLE) {
  const methods: (keyof Console)[] = ['log', 'info', 'warn', 'debug', 'error'];
  methods.forEach((m) => {
    jest.spyOn(console, m as any).mockImplementation(() => {});
  });
}
