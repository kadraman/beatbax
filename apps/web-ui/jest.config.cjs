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
        baseUrl: '.',
        paths: {
          '@beatbax/app-core/*': ['../../packages/app-core/src/*'],
          '@beatbax/ui-tokens/*': ['../../packages/ui-tokens/src/*'],
          '@beatbax/engine/util/logger': ['tests/__mocks__/logger.ts'],
          '@beatbax/engine/*': ['../../packages/engine/src/*'],
        },
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@beatbax|nanostores)/)',
  ],
  resolver: '<rootDir>/../../scripts/jest-resolver.cjs',
  moduleNameMapper: {
    '^@beatbax/app-core(.*)$': '<rootDir>/../../packages/app-core/src$1',
    '^@beatbax/ui-tokens(.*)$': '<rootDir>/../../packages/ui-tokens/src$1',
    '^@beatbax/engine/util/logger$': '<rootDir>/tests/__mocks__/logger.ts',
    '^monaco-editor$': '<rootDir>/tests/__mocks__/monaco-editor.ts',
    '^@beatbax/engine/parser$': '<rootDir>/tests/__mocks__/engine-parser.ts',
    '^@beatbax/engine/chips$': '<rootDir>/tests/__mocks__/engine-chips.ts',
    '^@beatbax/engine/export$': '<rootDir>/../../packages/app-core/tests/__mocks__/engine-export.ts',
    '^@beatbax/engine/song$': '<rootDir>/tests/__mocks__/engine-song.ts',
    '^@beatbax/engine/audio/playback$': '<rootDir>/tests/__mocks__/engine-playback.ts',
    '^@beatbax/engine$': '<rootDir>/../../packages/engine/src/index.ts',
    '\\.css$': '<rootDir>/tests/__mocks__/styleMock.js',
  },
  setupFiles: ['<rootDir>/tests/setup-canvas-mock.ts'],
};
