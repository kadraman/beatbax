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
};
