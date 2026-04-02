module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  transform: {
    '^.+\\.(ts|js)$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        allowJs: true,
        module: 'commonjs',
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@beatbax|nanostores)/)',
  ],
  moduleNameMapper: {
    '^@beatbax/engine/util/logger$': '<rootDir>/tests/__mocks__/logger.ts',
    '^monaco-editor$': '<rootDir>/tests/__mocks__/monaco-editor.ts',
    '^@beatbax/engine/parser$': '<rootDir>/tests/__mocks__/engine-parser.ts',
    '^@beatbax/engine/song$': '<rootDir>/tests/__mocks__/engine-song.ts',
    '^@beatbax/engine/audio/playback$': '<rootDir>/tests/__mocks__/engine-playback.ts',
    '\\.css$': '<rootDir>/tests/__mocks__/styleMock.js',
  },
  setupFiles: ['<rootDir>/tests/setup-canvas-mock.ts'],
};
