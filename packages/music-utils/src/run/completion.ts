#!/usr/bin/env node
import { generateBash } from '../completion/bash';

const SUPPORTED = ['bash'] as const;

const shell = process.argv[2];

if (!shell || !SUPPORTED.includes(shell as (typeof SUPPORTED)[number])) {
  process.stderr.write(`Usage: music-utils-completion <${SUPPORTED.join('|')}>\n`);
  process.stderr.write(`\nInstall (session):    source <(music-utils-completion bash)\n`);
  process.stderr.write(
    `Install (persistent): music-utils-completion bash > ~/.local/share/bash-completion/completions/music-utils\n`,
  );
  process.exit(1);
}

process.stdout.write(generateBash());
