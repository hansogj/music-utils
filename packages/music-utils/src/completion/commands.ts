export interface CommandSpec {
  /** The installed bin name, e.g. "music-utils-rip". */
  bin: string;
  /** Space-separated flag list for `compgen -W`. */
  flags: string;
  /** Flags whose value is a file path (bash: `compgen -f`). */
  fileFlags: string[];
  /** Flags whose value is a directory (bash: `compgen -d`). */
  dirFlags: string[];
  /** Completion for positional args when the current token isn't a flag. */
  positional: 'file' | 'dir' | 'none';
}

const ALBUM = { flag: '-a --album', file: [], dir: ['-a', '--album'] };

export const COMMANDS: CommandSpec[] = [
  {
    bin: 'music-utils-rip',
    flags: '-r --releaseId -d --disc',
    fileFlags: [],
    dirFlags: [],
    positional: 'none',
  },
  {
    bin: 'music-utils-album-tag',
    flags: ALBUM.flag,
    fileFlags: ALBUM.file,
    dirFlags: ALBUM.dir,
    positional: 'none',
  },
  {
    bin: 'music-utils-tracks-tag',
    flags: `${ALBUM.flag} -f --fileName`,
    fileFlags: ['-f', '--fileName'],
    dirFlags: ALBUM.dir,
    positional: 'none',
  },
  {
    bin: 'music-utils-cover-photo',
    flags: `${ALBUM.flag} -r --releaseId -Q --quiet`,
    fileFlags: [],
    dirFlags: ALBUM.dir,
    positional: 'none',
  },
  {
    bin: 'music-utils-album-cover',
    flags: ALBUM.flag,
    fileFlags: [],
    dirFlags: ALBUM.dir,
    positional: 'none',
  },
  {
    bin: 'music-utils-bulk-album-tag',
    flags: '',
    fileFlags: [],
    dirFlags: [],
    positional: 'dir',
  },
  {
    bin: 'music-utils-bulk-cover-photo',
    flags: '',
    fileFlags: [],
    dirFlags: [],
    positional: 'dir',
  },
  {
    bin: 'music-utils-sync-tracks',
    flags: ALBUM.flag,
    fileFlags: [],
    dirFlags: ALBUM.dir,
    positional: 'none',
  },
  {
    bin: 'music-utils-similarities',
    flags: '-A --dirA -B --dirB -T --threshold -f --fileName -I --ignore -Q --quiet',
    fileFlags: ['-f', '--fileName'],
    dirFlags: ['-A', '--dirA', '-B', '--dirB'],
    positional: 'none',
  },
];
