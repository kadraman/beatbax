module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx|js)$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        allowJs: true,
        module: 'commonjs',
        jsx: 'react-jsx',
        baseUrl: '.',
        paths: {
          // Keep in sync with moduleNameMapper so ts-jest typecheck can resolve
          // app-core sources pulled in outside the desktop package root.
          '@beatbax/app-core/*': ['../../packages/app-core/src/*'],
          '@beatbax/engine/util/logger': ['tests/__mocks__/logger.ts'],
          '@beatbax/engine/*': ['../../packages/engine/src/*'],
        },
      }
    }]
  },
  transformIgnorePatterns: ['node_modules/(?!(@beatbax|nanostores)/)'],
  resolver: '<rootDir>/../../scripts/jest-resolver.cjs',
  moduleNameMapper: {
    '^@beatbax/app-core(.*)$': '<rootDir>/../../packages/app-core/src$1',
    '^@beatbax/engine/util/logger$': '<rootDir>/tests/__mocks__/logger.ts',
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
    '^monaco-editor$': '<rootDir>/tests/__mocks__/monaco-editor.ts',
    '^.+\\.(css|svg|png)$': '<rootDir>/tests/__mocks__/styleMock.js'
  }
};
