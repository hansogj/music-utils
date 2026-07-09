import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    clearMocks: false,
    include: ['src/**/*.test.ts'],
    reporters: ['default', ['junit', { outputFile: 'junit-TEST.xml' }]],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/run/**',
        '**/prompt.ts',
        '**/color.log.ts',
        '**/photo.ts',
        '**/index.ts',
        '**/__mocks__/**',
      ],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
