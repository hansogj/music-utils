module.exports = {
    clearMocks: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    preset: 'ts-jest',
    testEnvironment: 'node',
    reporters: ['default', ['jest-junit', { outputName: 'junit-TEST.xml' }]],
    coverageThreshold: {
        global: {
            statements: 50,
            branches: 80,
            functions: 90,
            lines: 90,
        },
    },
    collectCoverageFrom: [

        "!**/*.js",
        "!**/run/**",
        "!**/node_modules/**",
        "!**/prompt.ts",
        "!**/color.log.ts",
        "!**/photo.ts"
    ],

    rootDir: './src',
    setupFiles: ['../jest.setup-file.ts'],

    // testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/utils/__mocks__/mockutils.ts', '<rootDir>/.* /__mocks__'],
    // transformIgnorePatterns: ['../build/', '../build.ci/'],
    // coveragePathIgnorePatterns: ['../build/', '../build.ci/'],
    transformIgnorePatterns: ['<rootDir>/node_modules/chalk/', '/chalk/'],
};
