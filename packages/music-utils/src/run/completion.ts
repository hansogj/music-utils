#!/usr/bin/env node
import { generateBash } from '../completion/bash';

const SUPPORTED = ['bash'] as const;

const shell = process.argv[2];

if (!shell || !SUPPORTED.includes(shell as (typeof SUPPORTED)[number])) {
  process.stderr.write(`Usage: mu completion <${SUPPORTED.join('|')}>\n`);
  process.stderr.write(`\nInstall (session):    source <(mu completion bash)\n`);
  process.stderr.write(
    `Install (persistent): mu completion bash > ~/.local/share/bash-completion/completions/music-utils\n`,
  );
  process.exit(1);
}

process.stdout.write(generateBash());
