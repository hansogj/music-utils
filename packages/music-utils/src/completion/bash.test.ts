import { generateBash } from './bash';

describe('generateBash', () => {
  const script = generateBash();

  it('prefixes with an install-instructions header', () => {
    expect(script).toMatch(/^# music-utils bash completion/);
    expect(script).toContain('source <(mu completion bash)');
    expect(script).toContain('completions/mu');
  });

  it('registers _mu for both mu and music-utils', () => {
    expect(script).toContain('complete -F _mu mu');
    expect(script).toContain('complete -F _mu music-utils');
  });

  it('no longer registers the pre-2.0 music-utils-* commands', () => {
    expect(script).not.toMatch(/complete -F \S+ music-utils-/);
  });

  it('completes top-level commands at COMP_CWORD=1', () => {
    expect(script).toContain('compgen -W "rip tag cover sync similarities audit completion help"');
  });

  it('completes tag subcommands', () => {
    expect(script).toContain('compgen -W "album tracks bulk"');
  });

  it('completes cover subcommands', () => {
    expect(script).toContain('compgen -W "album bulk"');
  });

  it('completes audit subcommands', () => {
    expect(script).toContain('compgen -W "repair retag"');
  });

  it('offers subcommands only when the second word is not a flag', () => {
    expect(script).toContain('if [[ $COMP_CWORD -eq 2 && "$cur" != -* ]]; then');
  });

  it('completes audit flags, including the year check', () => {
    expect(script).toContain(
      '--root --token --no-discogs --repair --retag --ui --json --log --check-years --no-check-years --help',
    );
  });

  it('completes flags for rip and similarities', () => {
    expect(script).toContain('compgen -W "--releaseId -r --disc -d"');
    expect(script).toContain('-A --dirA -B --dirB -T --threshold -f --fileName -I --ignore -Q --quiet');
  });

  it('sets up file completion for file-taking flags', () => {
    expect(script).toMatch(/-f\|--fileName\) mapfile -t COMPREPLY < <\(compgen -f/);
  });

  it('sets up directory completion for dir-taking flags', () => {
    expect(script).toMatch(/-a\|--album\) mapfile -t COMPREPLY < <\(compgen -d/);
    expect(script).toMatch(/-A\|--dirA\|-B\|--dirB\) mapfile -t COMPREPLY < <\(compgen -d/);
    expect(script).toMatch(/--root\) mapfile -t COMPREPLY < <\(compgen -d/);
  });

  it('emits positional directory completion for bulk subcommands', () => {
    expect(script).toMatch(/bulk\)\s+mapfile -t COMPREPLY < <\(compgen -d -- "\$cur"\)/);
  });
});
