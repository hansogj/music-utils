import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'music-audit': 'src/audit.ts', 'music-audit-completion': 'src/completion.ts' },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  banner: { js: '#!/usr/bin/env node' },
});
