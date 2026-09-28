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
    // similarities has -f/--fileName as file inputs; look for the alternation line + IFS guard + compgen -f
    expect(script).toMatch(/-f\|--fileName[^)]*\) local IFS.*COMPREPLY=\(\$\(compgen -f/);
  });

  it('sets up directory completion for dir-taking flags', () => {
    // -A and --dirA both appear in the dir alternation; IFS guard prevents space-splitting on dir names
    expect(script).toMatch(/-A[|][^)]*\) local IFS.*COMPREPLY=\(\$\(compgen -d/);
  });

  it('emits positional directory completion for bulk commands', () => {
    expect(script).toMatch(/_music_utils_bulk_album_tag[\s\S]*?compgen -d -- "\$cur"/);
    expect(script).toMatch(/_music_utils_bulk_cover_photo[\s\S]*?compgen -d -- "\$cur"/);
  });

  it('prefixes with an install-instructions header', () => {
    expect(script).toMatch(/^# music-utils bash completion/);
    expect(script).toContain('source <(music-utils-completion bash)');
  });
});
