module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Use package root as the default root so Jest won't fail when `tests/` is absent
  roots: ['<rootDir>'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Map relative `.js` imports to `.ts` during tests (we rewrite sources to use .js for runtime)
  resolver: '<rootDir>/../../scripts/jest-resolver.cjs',
  // Use the engine package setup file to keep shared test setup
  setupFilesAfterEnv: ['<rootDir>/../engine/tests/setupTests.ts'],
  // link-local-engine.cjs junctions to packages/engine (realpath outside node_modules).
  // Resolve @beatbax/engine to TypeScript sources so ts-jest compiles to CJS for tests.
  moduleNameMapper: {
    '^@beatbax/engine$': '<rootDir>/../engine/src/index.ts',
    '^@beatbax/engine/export$': '<rootDir>/../engine/src/export/index.ts',
    '^@beatbax/engine/node$': '<rootDir>/../engine/src/node/index.ts',
    '^@beatbax/engine/parser$': '<rootDir>/../engine/src/parser/index.ts',
    '^@beatbax/engine/song$': '<rootDir>/../engine/src/song/index.ts',
    '^@beatbax/engine/import$': '<rootDir>/../engine/src/import/index.ts',
    '^@beatbax/engine/chips$': '<rootDir>/../engine/src/chips/index.ts',
    '^@beatbax/engine/(.*)$': '<rootDir>/../engine/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!@beatbax/)',
  ],
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
};
