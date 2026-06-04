module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  resolver: '<rootDir>/../../../scripts/jest-resolver.cjs',
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  moduleNameMapper: {
    '^@beatbax/engine/chips/nes$': '<rootDir>/../../engine/src/chips/nes/index.ts',
    '^@beatbax/engine/chips/nes/(.*)\\.js$': '<rootDir>/../../engine/src/chips/nes/$1.ts',
    '^@beatbax/engine/chips$': '<rootDir>/../../engine/src/chips/index.ts',
    // Redirect @beatbax/engine imports to the plugin API entry point (avoids import.meta in index.ts)
    '^@beatbax/engine$': '<rootDir>/../../engine/src/plugin-api.ts',
    '^@beatbax/engine/(.*)$': '<rootDir>/../../engine/src/$1',
    // Redirect famitracker exporter to its source entry point
    '^@beatbax/plugin-exporter-famitracker$': '<rootDir>/../export-famitracker/src/index.ts',
    '^@beatbax/plugin-exporter-famitracker/(.*)$': '<rootDir>/../export-famitracker/src/$1',
  },
};
