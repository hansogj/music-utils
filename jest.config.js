module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputName: 'junit-TEST.xml',
      },
    ],
  ],
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 90,
      functions: 0,
      lines: 0,
    },
  },
  setupFiles: ['./jest.setup-file.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/utils/__mocks__/mockutils.ts',
    '<rootDir>/*/__mocks__/*',
    '<rootDir>/build/*',
    '<rootDir>/build.ci/*',
    '/build.ci/',
  ],
};
