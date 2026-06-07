module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  resolver: '<rootDir>/../../scripts/jest-resolver.cjs',
  transform: {
    '^.+\\.(ts|js)$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          allowJs: true,
          module: 'commonjs',
        },
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(@beatbax|nanostores)/)'],
  moduleNameMapper: {
    '^@beatbax/app-core(.*)$': '<rootDir>/src$1',
    '^@beatbax/engine/util/logger$': '<rootDir>/tests/__mocks__/logger.ts',
    '^monaco-editor$': '<rootDir>/tests/__mocks__/monaco-editor.ts',
    '^@beatbax/engine/parser$': '<rootDir>/tests/__mocks__/engine-parser.ts',
    '^@beatbax/engine/chips$': '<rootDir>/tests/__mocks__/engine-chips.ts',
    '^@beatbax/engine/song$': '<rootDir>/tests/__mocks__/engine-song.ts',
    '^@beatbax/engine/audio/playback$': '<rootDir>/tests/__mocks__/engine-playback.ts',
  },
  setupFiles: ['<rootDir>/tests/setup-canvas-mock.ts'],
};
