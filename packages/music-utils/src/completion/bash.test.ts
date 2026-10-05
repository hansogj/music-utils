import { generateBash } from './bash';
import { COMMANDS } from './commands';

describe('generateBash', () => {
  const script = generateBash();

  it('registers a completion function for every command', () => {
    COMMANDS.forEach(({ bin }) => {
      const fn = `_${bin.replace(/-/g, '_')}`;
      expect(script).toContain(`${fn}()`);
      expect(script).toContain(`complete -F ${fn} ${bin}`);
    });
  });

  it('includes flag lists for commands that declare flags', () => {
    COMMANDS.filter((c) => c.flags).forEach(({ flags }) => {
      expect(script).toContain(`"${flags}"`);
    });
  });

  it('sets up file completion for file-taking flags', () => {
    expect(script).toMatch(/-f\|--fileName[^)]*\) mapfile -t COMPREPLY < <\(compgen -f/);
  });

  it('sets up directory completion for dir-taking flags', () => {
    expect(script).toMatch(/-A[|][^)]*\) mapfile -t COMPREPLY < <\(compgen -d/);
  });

  it('emits positional directory completion for bulk commands', () => {
    expect(script).toMatch(/_music_utils_bulk_album_tag[\s\S]*?mapfile -t COMPREPLY < <\(compgen -d -- "\$cur"\)/);
    expect(script).toMatch(/_music_utils_bulk_cover_photo[\s\S]*?mapfile -t COMPREPLY < <\(compgen -d -- "\$cur"\)/);
  });

  it('prefixes with an install-instructions header', () => {
    expect(script).toMatch(/^# music-utils bash completion/);
    expect(script).toContain('source <(mu completion bash)');
  });

  describe('unified mu / music-utils completion', () => {
    it('registers _mu for both mu and music-utils', () => {
      expect(script).toContain('complete -F _mu mu');
      expect(script).toContain('complete -F _mu music-utils');
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

    it('completes audit flags', () => {
      expect(script).toContain('--root --token --no-discogs --repair --retag --ui --json --log --help');
    });

    it('completes flags for similarities', () => {
      expect(script).toContain('-A --dirA -B --dirB -T --threshold -f --fileName -I --ignore -Q --quiet');
    });
  });
});
