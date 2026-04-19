module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  resolver: '<rootDir>/../../../scripts/jest-resolver.cjs',
  moduleNameMapper: {
    '^@beatbax/engine$': '<rootDir>/../../engine/src/plugin-api.ts',
    '^@beatbax/engine/(.*)$': '<rootDir>/../../engine/src/$1',
  },
};
