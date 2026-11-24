import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlbumAudit, AlbumLayout, Issue, TrackInfo, TrackTags } from '../types.js';

// Tag writes are recorded per file instead of running metaflac / id3v2.
const written = new Map<string, Record<string, string>>();
vi.mock('../tag-write.js', () => ({
  writeTags: vi.fn(async (file: string, _ext: string, tags: Record<string, string>) => {
    written.set(path.basename(file), { ...written.get(path.basename(file)), ...tags });
  }),
}));

// A real image where ImageMagick is installed (the cover check reads it), else any bytes.
async function tinyJpeg(file: string): Promise<void> {
  try {
    (await import('node:child_process')).execFileSync('magick', ['-size', '4x4', 'xc:gray', file]);
  } catch {
    await fs.writeFile(file, 'JPEG');
  }
}

const { repairActions } = await import('./issue-actions.js');
const { resetRepairSession } = await import('./folder.js');
const { setPrompt } = await import('./prompt.js');

let root: string;
let layout: AlbumLayout;
let output: string[];

const issue = (code: string, extra: Partial<Issue> = {}): Issue => ({
  severity: 'MODERATE',
  code,
  message: code,
  ...extra,
});

async function album(folder: string, files: string[], { letter = 'Y', artist = 'Yezda Urfa' } = {}) {
  const albumPath = path.join(root, letter, artist, folder);
  await fs.mkdir(albumPath, { recursive: true });
  for (const f of files) await fs.writeFile(path.join(albumPath, f), '');
  layout = { letterDir: letter, artistName: artist, albumFolder: folder, albumPath };
  return layout;
}

function track(fileName: string, tags: TrackTags = {}, parsedName?: string): TrackInfo {
  return {
    filePath: path.join(layout.albumPath, fileName),
    fileName,
    ext: path.extname(fileName).slice(1) as 'mp3' | 'flac',
    tags,
    parsedName,
  };
}

const auditOf = (tracks: TrackInfo[] = [], extra: Partial<AlbumAudit> = {}): AlbumAudit => ({
  layout,
  tracks,
  issues: [],
  ...extra,
});

// Answers every prompt with the next answer, in order.
function answers(...list: string[]) {
  const queue = [...list];
  setPrompt(async (q) => {
    if (!queue.length) throw new Error(`Unexpected prompt: ${q}`);
    return queue.shift()!;
  });
}

const labels = (actions: Array<{ label: string }>) => actions.map((a) => a.label);

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-issue-actions-'));
  written.clear();
  output = [];
  resetRepairSession();
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void output.push(args.join(' ')));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('MISSING_YEAR_PREFIX', () => {
  it('renames with the year found in the folder name', async () => {
    await album('Sacred Baboon 1976', []);
    const actions = await repairActions(issue('MISSING_YEAR_PREFIX'), auditOf());
    expect(labels(actions)).toEqual([
      'Rename folder → "1976 Sacred Baboon 1976"',
      'Enter release year manually and rename (default: 1976)',
    ]);
    await actions[0].run();
    expect(layout.albumFolder).toBe('1976 Sacred Baboon 1976');
    await expect(fs.stat(layout.albumPath)).resolves.toBeTruthy();
  });

  it("falls back to the top Discogs result's original year", async () => {
    await album('Sacred Baboon', []);
    const actions = await repairActions(
      issue('MISSING_YEAR_PREFIX'),
      auditOf([], {
        discogsResults: [{ id: 1, title: 'Sacred Baboon', year: '1989', originalYear: '1976', releaseUrl: '' }],
      }),
    );
    expect(actions[0].label).toBe('Rename folder → "1976 Sacred Baboon"');
  });

  it('asks for the year; Enter takes the guess, a bad year skips', async () => {
    await album('Sacred Baboon', []);
    const [manual] = await repairActions(issue('MISSING_YEAR_PREFIX'), auditOf());
    expect(manual.label).toBe('Enter release year manually and rename');

    answers('76');
    await manual.run();
    expect(layout.albumFolder).toBe('Sacred Baboon');
    expect(output.join('\n')).toContain('Skipped — invalid year');

    answers('1976');
    await manual.run();
    expect(layout.albumFolder).toBe('1976 Sacred Baboon');
  });
});

describe('folder name fixes', () => {
  it('WRONG_DISC_SEPARATOR renames to the suggested name, and offers nothing without one', async () => {
    await album('1976 Sacred Baboon (Disc 1/2)', []);
    const actions = await repairActions(
      issue('WRONG_DISC_SEPARATOR', { suggestion: 'Rename to: "1976 Sacred Baboon (Disc 1∕2)"' }),
      auditOf(),
    );
    expect(labels(actions)).toEqual(['Rename folder → "1976 Sacred Baboon (Disc 1∕2)"']);
    await actions[0].run();
    expect(layout.albumFolder).toBe('1976 Sacred Baboon (Disc 1∕2)');

    expect(await repairActions(issue('WRONG_DISC_SEPARATOR'), auditOf())).toEqual([]);
  });

  it('WRONG_AUX_BRACKETS turns {…} into […]', async () => {
    await album('1976 Sacred Baboon {FLAC}', []);
    const [action] = await repairActions(issue('WRONG_AUX_BRACKETS'), auditOf());
    expect(action.label).toBe('Rename folder → "1976 Sacred Baboon [FLAC]"');
  });

  it('WRONG_LETTER_DIR moves the album, joining an artist folder of any case there', async () => {
    await album('1976 Sacred Baboon', [], { letter: 'U', artist: 'Yezda Urfa' });
    let [action] = await repairActions(issue('WRONG_LETTER_DIR'), auditOf());
    expect(action.label).toBe('Move "1976 Sacred Baboon" to Y/Yezda Urfa');

    await fs.mkdir(path.join(root, 'Y', 'YEZDA URFA'), { recursive: true });
    [action] = await repairActions(issue('WRONG_LETTER_DIR'), auditOf());
    expect(action.label).toBe('Move "1976 Sacred Baboon" to Y/YEZDA URFA (joins the folder there)');
    await action.run();
    expect(layout.albumPath).toBe(path.join(root, 'Y', 'YEZDA URFA', '1976 Sacred Baboon'));
  });
});

describe('NO_TAGS / MISSING_TAGS', () => {
  it('tags artist, album, year and numbers from the folder', async () => {
    await album('1976 Sacred Baboon (Disc 1∕2)', ['01 - One.mp3', '02 - Two.mp3']);
    const actions = await repairActions(issue('NO_TAGS'), auditOf());
    expect(labels(actions)).toEqual(['Tag from folder (Yezda Urfa — 1976 Sacred Baboon) — title will be empty']);
    await actions[0].run();
    expect(written.get('02 - Two.mp3')).toEqual({
      ARTIST: 'Yezda Urfa',
      ALBUMARTIST: 'Yezda Urfa',
      ALBUM: 'Sacred Baboon',
      TRACKNUMBER: '2/2',
      DISCNUMBER: '1/2',
      DATE: '1976',
    });
  });

  it('offers Discogs tagging first with a token', async () => {
    await album('Sacred Baboon', ['01 - One.mp3']);
    const actions = await repairActions(issue('MISSING_TAGS'), auditOf(), 'token');
    expect(actions).toHaveLength(2);
    expect(actions[0].discogs).toBe(true);
    expect(actions[1].label).toBe('Tag from folder (Yezda Urfa — ? Sacred Baboon) — title will be empty');
  });
});

describe('YEAR_NOT_ORIGINAL', () => {
  const original = { releaseId: '1', year: '1976', masterId: 1 };

  it('offers nothing without the original year', async () => {
    await album('1989 Sacred Baboon', ['01 - One.mp3']);
    expect(await repairActions(issue('YEAR_NOT_ORIGINAL'), auditOf())).toEqual([]);
  });

  it('only retags when the folder has no other year', async () => {
    await album('Sacred Baboon', ['01 - One.mp3']);
    const actions = await repairActions(issue('YEAR_NOT_ORIGINAL'), auditOf([], { originalYear: original }));
    expect(labels(actions)).toEqual(['Set DATE/ORIGINALDATE to 1976']);
    await actions[0].run();
    expect(written.get('01 - One.mp3')).toEqual({ DATE: '1976', ORIGINALDATE: '1976' });
  });

  it('retags and renames the folder, asking about the old year', async () => {
    await album('1989 Sacred Baboon', ['01 - One.mp3']);
    const actions = await repairActions(issue('YEAR_NOT_ORIGINAL'), auditOf([], { originalYear: original }));
    expect(labels(actions)).toEqual([
      'Set DATE/ORIGINALDATE to 1976 and rename folder → "1976 Sacred Baboon"',
      'Set DATE/ORIGINALDATE to 1976 (keep folder name)',
    ]);
    answers('r');
    expect(await actions[0].run()).toBe(
      'Set DATE/ORIGINALDATE to 1976 and rename folder → "1976 Sacred Baboon [rec. 1989]"',
    );
    expect(written.get('01 - One.mp3')).toEqual({ DATE: '1976', ORIGINALDATE: '1976' });
  });
});

describe('NAME_TAG_MISMATCH', () => {
  it('renames the file to the tag, or writes the file name to the tag', async () => {
    await album('1976 Sacred Baboon', ['01 - Boris.mp3', '02 - Doggie.mp3']);
    const tracks = [
      track('01 - Boris.mp3', { title: 'Boris' }, 'Boris'),
      track('02 - Doggie.mp3', { title: '(My Doc Told Me I Had) Doggie Head', artist: 'Yezda Urfa' }, 'Doggie'),
    ];
    const actions = await repairActions(issue('NAME_TAG_MISMATCH', { file: '02 - Doggie.mp3' }), auditOf(tracks));
    expect(labels(actions)).toEqual([
      'Rename file to match tag → "02 - Yezda Urfa - (My Doc Told Me I Had) Doggie Head.mp3"',
      'Update TITLE tag → "Doggie"',
    ]);
    await actions[0].run();
    expect(tracks[1].fileName).toBe('02 - Yezda Urfa - (My Doc Told Me I Had) Doggie Head.mp3');
    await expect(fs.stat(tracks[1].filePath)).resolves.toBeTruthy();

    await actions[1].run();
    expect(written.get('02 - Yezda Urfa - (My Doc Told Me I Had) Doggie Head.mp3')).toEqual({ TITLE: 'Doggie' });
    expect(tracks[1].tags.title).toBe('Doggie');
  });

  it('keeps the dNtNN form for a file of several discs', async () => {
    await album('1976 Sacred Baboon', ['d2t03. Boris.flac']);
    const tracks = [track('d2t03. Boris.flac', { title: 'Boris And His Three Verses' })];
    const actions = await repairActions(issue('NAME_TAG_MISMATCH', { file: 'd2t03. Boris.flac' }), auditOf(tracks));
    expect(labels(actions)).toEqual(['Rename file to match tag → "d2t03. Boris And His Three Verses.flac"']);
  });

  it('offers nothing without a file or for an unknown file', async () => {
    await album('1976 Sacred Baboon', []);
    expect(await repairActions(issue('NAME_TAG_MISMATCH'), auditOf())).toEqual([]);
    expect(await repairActions(issue('NAME_TAG_MISMATCH', { file: 'x.mp3' }), auditOf())).toEqual([]);
  });
});

describe('MISSING_RELEASE_ID', () => {
  it('restores the release ID from the comment URL to the tracks that lost it', async () => {
    await album('1976 Sacred Baboon', ['01 - One.mp3', '02 - Two.mp3']);
    const tracks = [
      track('01 - One.mp3', { discogsMasterId: '9', comment: 'https://www.discogs.com/release/4376665' }),
      track('02 - Two.mp3', { discogsMasterId: '9', discogsReleaseId: '4376665' }),
    ];
    const actions = await repairActions(issue('MISSING_RELEASE_ID'), auditOf(tracks));
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toMatch(
      /^Write release ID 4376665 \(from .+\) and the Discogs URL comment to 1 track\(s\)$/,
    );
    await actions[0].run();
    expect(written.get('01 - One.mp3')).toEqual({
      DISCOGS_RELEASE_ID: '4376665',
      COMMENT: 'https://www.discogs.com/release/4376665',
    });
    expect(written.has('02 - Two.mp3')).toBe(false);
  });

  it('offers only Discogs retagging when no ID is found', async () => {
    await album('1976 Sacred Baboon', ['01 - One.mp3']);
    const tracks = [track('01 - One.mp3', { discogsMasterId: '9' })];
    expect(await repairActions(issue('MISSING_RELEASE_ID'), auditOf(tracks))).toEqual([]);
    const withToken = await repairActions(issue('MISSING_RELEASE_ID'), auditOf(tracks), 'token');
    expect(withToken.map((a) => a.discogs)).toEqual([true]);
  });
});

describe('artist folder vs tags', () => {
  it('writes the folder name to ALBUMARTIST, and ARTIST only where it is the album artist', async () => {
    await album('1976 Sacred Baboon', ['01 - One.mp3', '02 - Two.mp3']);
    const tracks = [
      track('01 - One.mp3', { artist: 'Yezda', albumArtist: 'Yezda' }),
      track('02 - Two.mp3', { artist: 'A Guest', albumArtist: 'Yezda' }),
    ];
    const actions = await repairActions(issue('ARTIST_TAG_INVERTED'), auditOf(tracks));
    expect(labels(actions)).toEqual([
      'Write "Yezda Urfa" to the artist tags (ALBUMARTIST; ARTIST where it is empty or the same)',
    ]);
    await actions[0].run();
    expect(written.get('01 - One.mp3')).toEqual({ ALBUMARTIST: 'Yezda Urfa', ARTIST: 'Yezda Urfa' });
    expect(written.get('02 - Two.mp3')).toEqual({ ALBUMARTIST: 'Yezda Urfa' });
    expect(await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8')).toContain(
      'artist tags were changed from "Yezda" to "Yezda Urfa"',
    );
  });

  it("ARTIST_FOLDER_MISMATCH first offers a move to the tags' artist, under its letter", async () => {
    await album('1976 Sacred Baboon', ['01 - One.mp3']);
    const tracks = [track('01 - One.mp3', { albumArtist: 'Banana / Urfa' })];
    const actions = await repairActions(issue('ARTIST_FOLDER_MISMATCH'), auditOf(tracks));
    expect(labels(actions)).toEqual([
      'Move the album to artist folder "B/Banana - Urfa" (the tags\' name)',
      'Write "Yezda Urfa" to the artist tags (ALBUMARTIST; ARTIST where it is empty or the same)',
    ]);
    await actions[0].run();
    expect(layout.albumPath).toBe(path.join(root, 'B', 'Banana - Urfa', '1976 Sacred Baboon'));
  });
});

describe('names an SMB share cannot hold', () => {
  it('UNSAFE_FOLDER_NAME renames the album folder to the safe name', async () => {
    await album('1961 Dexter Calling...', [], { letter: 'D', artist: 'Dexter Gordon' });
    const [action] = await repairActions(issue('UNSAFE_FOLDER_NAME'), auditOf());
    expect(action.label).toBe('Rename folder → "1961 Dexter Calling"');
    await action.run();
    expect(layout.albumFolder).toBe('1961 Dexter Calling');
  });

  it('UNSAFE_ARTIST_NAME moves the album to the safe artist folder; the tags keep their name', async () => {
    await album('1966 Soul Message', ['01 - Grooving.flac'], { letter: 'H', artist: 'Richard "Groove" Holmes' });
    const [action] = await repairActions(issue('UNSAFE_ARTIST_NAME'), auditOf([track('01 - Grooving.flac')]));
    expect(action.label).toBe('Move the album to artist folder "Richard Groove Holmes" (the tags keep their name)');
    await action.run();
    expect(layout.albumPath).toBe(path.join(root, 'H', 'Richard Groove Holmes', '1966 Soul Message'));
    expect(written.size).toBe(0);
  });

  it('UNSAFE_FILE_NAME renames every unsafe file', async () => {
    await album('1972 Close To The Edge', ['01 - Close To The Edge: I.flac', '02 - What?.flac', '03 - Siberian.flac']);
    const tracks = ['01 - Close To The Edge: I.flac', '02 - What?.flac', '03 - Siberian.flac'].map((f) => track(f));
    const [action] = await repairActions(issue('UNSAFE_FILE_NAME'), auditOf(tracks));
    expect(action.label).toBe(
      'Rename 2 file(s) ("01 - Close To The Edge: I.flac" → "01 - Close To The Edge - I.flac", …)',
    );
    await action.run();
    expect((await fs.readdir(layout.albumPath)).sort()).toEqual([
      '01 - Close To The Edge - I.flac',
      '02 - What.flac',
      '03 - Siberian.flac',
    ]);
  });

  it('offers nothing when the name is safe already', async () => {
    await album('1976 Sacred Baboon', []);
    expect(await repairActions(issue('UNSAFE_FOLDER_NAME'), auditOf())).toEqual([]);
    expect(await repairActions(issue('UNSAFE_ARTIST_NAME'), auditOf())).toEqual([]);
    expect(await repairActions(issue('UNSAFE_FILE_NAME'), auditOf([track('01 - One.flac')]))).toEqual([]);
  });
});

describe('disc numbers and sets', () => {
  it('DISC_ABOVE_TOTAL writes 1/1 in a one-disc folder whose old names say disc 2', async () => {
    await album('1961 Dexter Calling', [], { letter: 'D', artist: 'Dexter Gordon' });
    const tracks = [
      track('d2t01. Dexter Gordon - Soul Sister.flac', { discNumber: '2/1' }),
      track('d2t02. Dexter Gordon - Modal Mood.flac', { discNumber: '2/1' }),
    ];
    const [action] = await repairActions(issue('DISC_ABOVE_TOTAL'), auditOf(tracks));
    expect(action.label).toBe('Write DISCNUMBER 1/1 to 2 track(s)');
    await action.run();
    expect(written.get('d2t01. Dexter Gordon - Soul Sister.flac')).toEqual({ DISCNUMBER: '1/1' });
  });

  it('DISC_ABOVE_TOTAL writes the folder’s n/m in a disc folder, only where it differs', async () => {
    await album('1971 Live (Disc 2∕2)', []);
    const tracks = [track('01 - A.flac', { discNumber: '3/2' }), track('02 - B.flac', { discNumber: '2/2' })];
    const [action] = await repairActions(issue('DISC_ABOVE_TOTAL'), auditOf(tracks));
    expect(action.label).toBe('Write DISCNUMBER 2/2 to 1 track(s)');
  });

  it('MIXED_SET_RELEASE offers Discogs tagging, with a token', async () => {
    await album('1970 Live In Detroit (Disc 2∕2)', ['01 - Roadhouse Blues.flac'], { letter: 'D', artist: 'The Doors' });
    const audit = auditOf([track('01 - Roadhouse Blues.flac')]);
    expect(await repairActions(issue('MIXED_SET_RELEASE'), audit)).toEqual([]);
    expect((await repairActions(issue('MIXED_SET_RELEASE'), audit, 'token')).map((a) => a.discogs)).toEqual([true]);
  });

  it('WRONG_DISC_SEPARATOR fixes a lower-case "disc" by a case-only rename', async () => {
    await album('1999 Debile Menthol (disc 1∕2)', []);
    const [action] = await repairActions(
      issue('WRONG_DISC_SEPARATOR', { suggestion: 'Rename to: "1999 Debile Menthol (Disc 1∕2)"' }),
      auditOf(),
    );
    await action.run();
    expect(await fs.readdir(path.dirname(layout.albumPath))).toEqual(['1999 Debile Menthol (Disc 1∕2)']);
  });
});

describe('other issues', () => {
  it('DUPLICATE_TRACKS lists the files for a manual look', async () => {
    await album('1976 Sacred Baboon', []);
    const [action] = await repairActions(issue('DUPLICATE_TRACKS'), auditOf([track('a.mp3'), track('b.mp3')]));
    await action.run();
    expect(output.join('\n')).toContain('Files:  a.mp3, b.mp3');
  });

  it("ARTIST_COVER_MISSING copies an album's cover to the artist folder", async () => {
    await album('1976 Sacred Baboon', []);
    await tinyJpeg(path.join(layout.albumPath, 'cover.jpg'));
    const actions = await repairActions(issue('ARTIST_COVER_MISSING'), auditOf());
    expect(labels(actions)).toEqual(['Copy cover.jpg from "1976 Sacred Baboon" to the artist folder "Yezda Urfa"']);
    await actions[0].run();
    expect(await fs.readFile(path.join(root, 'Y', 'Yezda Urfa', 'cover.jpg'))).toEqual(
      await fs.readFile(path.join(layout.albumPath, 'cover.jpg')),
    );
  });

  it('covers go to coverActions, unknown codes get nothing', async () => {
    await album('1976 Sacred Baboon', []);
    expect(await repairActions(issue('MISSING_COVER'), auditOf())).toEqual([]);
    expect(await repairActions(issue('SOMETHING_ELSE'), auditOf())).toEqual([]);
  });
});
