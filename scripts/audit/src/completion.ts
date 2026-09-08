#!/usr/bin/env node

const SCRIPT = `# music-audit bash completion
# Source this file or add to ~/.bashrc:
#   source <(pnpm tsx /path/to/scripts/audit/src/completion.ts bash)
# Or install persistently:
#   pnpm tsx /path/to/scripts/audit/src/completion.ts bash \\
#     > ~/.local/share/bash-completion/completions/music-audit

_music_audit() {
  local cur prev flag
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  # bash splits on '=' (it's in COMP_WORDBREAKS), so --root=/path gives:
  #   prev="="  cur="/path..."  and the actual flag is two words back.
  if [[ "$prev" == "=" ]]; then
    flag="\${COMP_WORDS[COMP_CWORD-2]}"
  else
    flag="$prev"
  fi

  # Value completions for flags that take a path or token
  case "$flag" in
    --root) COMPREPLY=($(compgen -d -- "$cur")); return ;;
    --token) COMPREPLY=(); return ;;
  esac

  # Flag completion — offer flags without trailing '=' so nospace isn't needed
  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--root --token --no-discogs --json --help" -- "$cur"))
    return
  fi

  # Default positional: directory
  COMPREPLY=($(compgen -d -- "$cur"))
}

complete -F _music_audit music-audit

# Convenience alias so 'music-audit' works from anywhere in this repo
alias music-audit="pnpm --filter @music/audit run audit --"
`;

const SUPPORTED = ['bash'] as const;
const shell = process.argv[2];

if (!shell || !SUPPORTED.includes(shell as (typeof SUPPORTED)[number])) {
  process.stderr.write(`Usage: pnpm tsx src/completion.ts <${SUPPORTED.join('|')}>\n`);
  process.stderr.write(`\nInstall (session):    source <(pnpm tsx src/completion.ts bash)\n`);
  process.stderr.write(
    `Install (persistent): pnpm tsx src/completion.ts bash > ~/.local/share/bash-completion/completions/music-audit\n`,
  );
  process.exit(1);
}

process.stdout.write(SCRIPT);
