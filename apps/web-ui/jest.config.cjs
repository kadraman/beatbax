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
    'node_modules/(?!(@beatbax)/)',
  ],
  moduleNameMapper: {
    '^@beatbax/engine/util/logger$': '<rootDir>/tests/__mocks__/logger.ts',
    '^monaco-editor$': '<rootDir>/tests/__mocks__/monaco-editor.ts',
    '\\.css$': '<rootDir>/tests/__mocks__/styleMock.js',
  },
};
