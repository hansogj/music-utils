import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/audit.ts',
        '**/repair.ts',
        '**/server.ts',
        '**/discogs.ts',
        '**/logger.ts',
        '**/info-txt.ts',
        '**/term-link.ts',
        '**/completion.ts',
        '**/report.ts',
        '**/tags.ts',
        '**/types.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
