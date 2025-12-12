module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  resolver: '<rootDir>/../../scripts/jest-resolver.cjs',
  // Use the package-local setup file
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
};
