module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  resolver: '<rootDir>/../../../scripts/jest-resolver.cjs',
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  moduleNameMapper: {
    // Redirect @beatbax/engine imports to the plugin API entry point (avoids import.meta in index.ts)
    '^@beatbax/engine$': '<rootDir>/../../engine/src/plugin-api.ts',
    '^@beatbax/engine/(.*)$': '<rootDir>/../../engine/src/$1',
    // Redirect famitracker exporter to its source entry point
    '^@beatbax/plugin-exporter-famitracker$': '<rootDir>/../export-famitracker/src/index.ts',
    '^@beatbax/plugin-exporter-famitracker/(.*)$': '<rootDir>/../export-famitracker/src/$1',
  },
};
