import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Prefer verifying a tag that was likely absent before (TRACKNUMBER, DATE) over
// TITLE which may already be present — catches partial NFS write failures.
const FLAC_VERIFY_PRIORITY = ['TRACKNUMBER', 'TRACKTOTAL', 'DATE', 'ARTIST', 'ALBUM', 'TITLE'];

async function writeFlacTags(filePath: string, tags: Record<string, string>): Promise<void> {
  const removeArgs = Object.keys(tags).map((k) => `--remove-tag=${k}`);
  const { stderr: se1 } = await execFileAsync('metaflac', [...removeArgs, filePath]);
  if (se1?.trim()) throw new Error(`metaflac remove: ${se1.trim()}`);
  // An empty value only removes the tag (e.g. a stale DISCOGS_MASTER_ID after retagging to a release without one).
  const setArgs = Object.entries(tags)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `--set-tag=${k}=${v.trim()}`);
  const { stderr: se2 } = await execFileAsync('metaflac', [...setArgs, filePath]);
  if (se2?.trim()) throw new Error(`metaflac set: ${se2.trim()}`);
  // Verify a freshly-written tag actually landed (catches silent NFS/root-squash failures).
  const verifyTag = FLAC_VERIFY_PRIORITY.find((t) => tags[t]) ?? Object.keys(tags)[0];
  if (verifyTag) {
    const { stdout: verify } = await execFileAsync('metaflac', [`--show-tag=${verifyTag}`, filePath]);
    if (!verify.includes('=')) {
      throw new Error(
        `FLAC tags were not written (verified ${verifyTag}) — file may be on a read-only or root-squash NFS mount. Try running as the file owner instead of root.`,
      );
    }
  }
}

async function writeMp3Tags(filePath: string, tags: Record<string, string>): Promise<void> {
  const ID3: Record<string, string> = {
    TITLE: 'TIT2',
    ARTIST: 'TPE1',
    ALBUMARTIST: 'TPE2',
    ALBUM: 'TALB',
    DATE: 'TYER',
    ORIGINALDATE: 'TORY', // ID3v2.3 (what id3v2 writes); TDOR is the v2.4 equivalent
    TRACKNUMBER: 'TRCK',
    DISCNUMBER: 'TPOS',
    GENRE: 'TCON',
  };
  const args = ['-2'];
  for (const [k, v] of Object.entries(tags)) {
    if (ID3[k]) args.push(`--${ID3[k]}`, v.trim());
    else if (k === 'COMMENT') args.push('--COMM', v.trim());
    // "DESC:value" sets the frame description; the old "DESC=value" form left it empty.
    else if (k === 'DISCOGS_RELEASE_ID' || k === 'DISCOGS_MASTER_ID') args.push('--TXXX', `${k}:${v.trim()}`);
  }
  args.push(filePath);
  const { stderr } = await execFileAsync('id3v2', args);
  if (stderr?.trim()) throw new Error(`id3v2: ${stderr.trim()}`);

  // Verify a freshly-written tag actually landed (catches silent NFS/root-squash failures).
  const MP3_VERIFY_PRIORITY: Array<[string, string]> = [
    ['TRACKNUMBER', 'TRCK'],
    ['DATE', 'TYER'],
    ['ARTIST', 'TPE1'],
    ['ALBUM', 'TALB'],
    ['TITLE', 'TIT2'],
  ];
  const verifyPair = MP3_VERIFY_PRIORITY.find(([field]) => tags[field]);
  if (verifyPair) {
    const [field, frame] = verifyPair;
    const { stdout: verify } = await execFileAsync('id3v2', ['-l', filePath]);
    if (!verify.includes(frame)) {
      throw new Error(
        `Tags were not written (verified ${field}) — file may be on a read-only or root-squash NFS mount. Try running as the file owner instead of root.`,
      );
    }
  }
}

export async function writeTags(filePath: string, ext: 'flac' | 'mp3', tags: Record<string, string>): Promise<void> {
  if (ext === 'flac') {
    // FLAC keeps TRACKNUMBER and TRACKTOTAL separate
    const { TRACKNUMBER, ...rest } = tags;
    if (TRACKNUMBER?.includes('/')) {
      const [no, total] = TRACKNUMBER.split('/');
      await writeFlacTags(filePath, { ...rest, TRACKNUMBER: no, TRACKTOTAL: total });
    } else {
      await writeFlacTags(filePath, tags);
    }
  } else {
    await writeMp3Tags(filePath, tags);
  }
}
