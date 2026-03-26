/**
 * Mock for @mlc-ai/web-llm — prevents actual model downloads in tests.
 */
export const CreateMLCEngine = jest.fn(async () => ({
  chat: {
    completions: {
      create: jest.fn(async () => ({
        choices: [{ message: { content: 'Mocked response' } }],
      })),
    },
  },
}));
