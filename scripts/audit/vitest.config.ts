import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages from their src/, as tsx runs them: no build needed first.
  resolve: { conditions: ['@hansogj/source'] },
  ssr: { resolve: { conditions: ['@hansogj/source'] } },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/test-setup.ts',
        '**/audit.ts',
        '**/repair.ts',
        '**/server.ts',
        '**/logger.ts',
        '**/term-link.ts',
        '**/completion.ts',
        '**/report.ts',
        '**/tags.ts',
        '**/tag-write.ts',
        '**/types.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
