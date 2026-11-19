import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setArticleSort } from './articles.js';
import type { ReleaseInfo } from './discogs.js';
import type { AlbumAudit, AlbumLayout, TrackTags } from './types.js';

// Fake audio files: each "mp3" holds its tags as JSON, so renames carry the tags along
// and no metaflac/id3v2 is needed.
async function readFake(filePath: string): Promise<Record<string, string>> {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

vi.mock('./tags.js', () => ({
  readTags: async (filePath: string) => {
    const t = await readFake(filePath);
    const [trackNo, trackNoTotal] = (t.TRACKNUMBER ?? '').split('/');
    const tags: TrackTags = {
      title: t.TITLE,
      artist: t.ARTIST,
      albumArtist: t.ALBUMARTIST,
      album: t.ALBUM,
      year: t.DATE,
      trackNo: trackNo || undefined,
      trackNoTotal: trackNoTotal || undefined,
      originalYear: t.ORIGINALDATE,
      discogsReleaseId: t.DISCOGS_RELEASE_ID,
      discogsMasterId: t.DISCOGS_MASTER_ID || undefined,
      comment: t.COMMENT,
    };
    return { tags };
  },
}));

vi.mock('./tag-write.js', () => ({
  writeTags: async (filePath: string, _ext: string, tags: Record<string, string>) => {
    await fs.writeFile(filePath, JSON.stringify({ ...(await readFake(filePath)), ...tags }));
  },
}));

const TITLES = [
  "Give 'Em Some Rawhide Chewies",
  'Cancer Of The Band',
  'To-Ta In The Moya',
  'Boris And His Three Verses',
  "Flow Guides Aren't My Bag",
  '(My Doc Told Me I Had) Doggie Head',
  '3, Almost 4, 6, Yea',
];

const RELEASE: ReleaseInfo = {
  releaseId: '4376665',
  masterId: 123456,
  year: '1989',
  releaseYear: '1989',
  title: 'Sacred Baboon',
  artists: ['Yezda Urfa'],
  tracklist: TITLES.map((title, i) => ({ position: String(i + 1), title, type_: 'track' })),
};

vi.mock('./discogs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./discogs.js')>()),
  fetchRelease: vi.fn(async () => RELEASE),
  fetchReleaseCover: vi.fn(async () => ({
    cover: { uri: 'https://i.discogs.com/600', uri150: 'https://i.discogs.com/150' },
  })),
  downloadImage: vi.fn(async () => (await import('node:fs/promises')).readFile(TINY_JPEG)),
}));

// A real image where ImageMagick is installed (the cover check reads it), else any bytes.
const TINY_JPEG = path.join(os.tmpdir(), `audit-repair-cover-${process.pid}.jpg`);
try {
  (await import('node:child_process')).execFileSync('magick', ['-size', '4x4', 'xc:gray', TINY_JPEG]);
} catch {
  await fs.writeFile(TINY_JPEG, 'JPEG');
}
afterAll(() => fs.rm(TINY_JPEG, { force: true }));

const { auditAlbum } = await import('./audit-album.js');
const { formatSummary, repairAlbum, resetRepairSession, setPrompt, splitArtistBrackets } = await import('./repair.js');
type RepairEvent = import('./repair.js').RepairEvent;

let root: string;
let layout: AlbumLayout;
let events: Array<Omit<RepairEvent, 'ts' | 'session'>>;
let output: string[];
let asked: string[];
let prefills: Array<string | undefined>;

// Answers prompts in order; fails on a prompt the test didn't expect.
function answer(script: Array<[RegExp, string]>) {
  const queue = [...script];
  setPrompt(async (q, prefill) => {
    asked.push(q);
    prefills.push(prefill);
    const next = queue.shift();
    if (!next || !next[0].test(q)) throw new Error(`Unexpected prompt: ${JSON.stringify(q)}`);
    return next[1];
  });
  return () => expect(queue, 'unanswered prompts').toEqual([]);
}

async function scan(): Promise<AlbumAudit> {
  return auditAlbum(layout, { skipDiscogs: true });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-repair-'));
  const albumPath = path.join(root, 'Y', 'Yezda Urfa', '1976 Sacred Baboon');
  await fs.mkdir(albumPath, { recursive: true });
  layout = { letterDir: 'Y', artistName: 'Yezda Urfa', albumFolder: '1976 Sacred Baboon', albumPath };

  // As in the reported run: every track has a TITLE but nothing else, and track 6's
  // TITLE is cut short, so the file name and the tag disagree.
  const files: Array<[string, string]> = [
    ["01 - Give'em Some Rawhide Chewies.mp3", "Give'em Some Rawhide Chewies"],
    ...TITLES.slice(1).map((t, i): [string, string] => [`0${i + 2} - ${t}.mp3`, t]),
  ];
  files[5][1] = '(My Doc Told Me I Had) Doggie';
  for (const [name, title] of files) await fs.writeFile(path.join(albumPath, name), JSON.stringify({ TITLE: title }));

  events = [];
  output = [];
  asked = [];
  prefills = [];
  resetRepairSession();
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void output.push(args.join(' ')));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

const ctx = (reaudit = true) => ({
  token: 'test-token',
  reaudit: reaudit ? (l: AlbumLayout) => auditAlbum(l, { skipDiscogs: true }) : undefined,
  logEvent: async (e: Omit<RepairEvent, 'ts' | 'session'>) => void events.push(e),
});

describe('repairAlbum — Yezda Urfa: Discogs tags, then a year rename', () => {
  it('starts with missing tags and a name/tag mismatch on track 6', async () => {
    const audit = await scan();
    expect(audit.issues.map((i) => i.code)).toEqual(['MISSING_TAGS', 'NAME_TAG_MISMATCH']);
    expect(audit.issues[1].file).toBe('06 - (My Doc Told Me I Had) Doggie Head.mp3');
  });

  it('drops the out-of-date mismatch after tagging and renames the folder last', async () => {
    const audit = await scan();
    audit.discogsResults = [
      {
        id: 4376665,
        title: 'Yezda Urfa - Sacred Baboon',
        year: '1989',
        releaseUrl: 'https://www.discogs.com/release/4376665',
      },
    ];
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → [1] Tag from Discogs
      [/Release ID \[4376665\]/, ''], // use the suggested release
      [/Apply renames\?/, 'y'], // 01 - Give'em → 01 - Give 'Em
      [/Rename folder\(s\) to match Discogs\?/, 'y'], // 1976 → 1989, deferred
      [/Old year \[Enter\/l\/r\/c\]/, 'r'], // recorded 1976, released 1989
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();

    // The mismatch was solved by the Discogs tags, so it was never shown or acted on.
    expect(output.join('\n')).not.toMatch(/Filename implies/);
    expect(events.map((e) => [e.issue, e.result])).toEqual([
      ['MISSING_TAGS', 'fixed'],
      ['FOLDER_RENAME', 'fixed'],
    ]);
    expect(audit.issues).toEqual([]);

    // The folder rename ran after the file renames, and the layout follows it.
    const newPath = path.join(root, 'Y', 'Yezda Urfa', '1989 Sacred Baboon [rec. 1976]');
    expect(layout.albumPath).toBe(newPath);
    expect(layout.albumFolder).toBe('1989 Sacred Baboon [rec. 1976]');
    expect(output.join('\n')).toMatch(/r {2}recorded +→ 1989 Sacred Baboon \[rec\. 1976\]/);
    // The log has the final folder name; info.txt notes the change at the bottom.
    expect(events.find((e) => e.issue === 'FOLDER_RENAME')?.action).toBe(
      'Rename folder(s) to match Discogs → "Yezda Urfa/1989 Sacred Baboon [rec. 1976]"',
    );
    await expect(fs.access(path.join(root, 'Y', 'Yezda Urfa', '1976 Sacred Baboon'))).rejects.toThrow();

    const names = (await fs.readdir(newPath)).sort();
    expect(names).toContain("01 - Give 'Em Some Rawhide Chewies.mp3");
    expect(names).toContain('info.txt');
    const track6 = await readFake(path.join(newPath, '06 - (My Doc Told Me I Had) Doggie Head.mp3'));
    expect(track6).toMatchObject({
      TITLE: '(My Doc Told Me I Had) Doggie Head',
      DATE: '1989',
      DISCOGS_RELEASE_ID: '4376665',
      DISCOGS_MASTER_ID: '123456',
    });
    const info = await fs.readFile(path.join(newPath, 'info.txt'), 'utf8');
    expect(info).toMatch(/Discogs-Release: 4376665\nDiscogs-Master: 123456\nDisc: 1\/1/);
    expect(info).toMatch(
      /\n={15}Changeset={14}\n\[\d{4}-\d\d-\d\d \d\d:\d\d\]: folder name was changed from "1976 Sacred Baboon" to "1989 Sacred Baboon \[rec\. 1976\]"\n$/,
    );
  });

  it('a skipped issue is not asked again in the same pass', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 's'], // MISSING_TAGS
      [/Brackets:/, ''], // first skip in the album: no bracket added
      [/^ {2}Choice \[1\]/, 's'], // NAME_TAG_MISMATCH
      [/\[r\] Retry/, ''], // 2 issues not fixed → continue
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/2 issue\(s\) not fixed/);
    expect(events.map((e) => e.result)).toEqual(['skipped', 'skipped']);
    // One prompt to go on: no "[Enter] Next album   [q] Quit" after it.
    expect(asked.at(-1)).toBe('  [Enter] Next album   [r] Retry   [q] Quit: ');
  });

  it('[r] at the "not fixed" prompt shows the issues again', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 's'],
      [/Brackets:/, ''],
      [/^ {2}Choice \[1\]/, 's'],
      [/\[r\] Retry/, 'r'],
      [/^ {2}Choice \[1\]/, 's'], // the same two issues, from the top
      [/^ {2}Choice \[1\]/, 's'],
      [/\[r\] Retry/, 'q'],
    ]);
    expect(await repairAlbum(audit, ctx())).toBe('quit');
    done();
  });

  it('shows the formats in the album table, with the ones the audit does not read', async () => {
    await fs.writeFile(path.join(layout.albumPath, 'bonus.wav'), '');
    const audit = await scan();
    answer([[/^ {2}Choice \[1\]/, 'q']]);
    await repairAlbum(audit, ctx());
    expect(output.join('\n')).toMatch(/Format +│ MP3 \d+ · WAV 1 \(not checked\)/);
  });

  it('without a re-scan, a fixed issue still drops out', async () => {
    const audit = await scan();
    audit.issues = audit.issues.filter((i) => i.code === 'NAME_TAG_MISMATCH');
    const done = answer([
      [/^ {2}Choice \[1\]/, '2'], // Update TITLE tag to match the file name
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, ctx(false))).toBe('next');
    done();
    expect(audit.issues).toEqual([]);
    const track6 = await readFake(path.join(layout.albumPath, '06 - (My Doc Told Me I Had) Doggie Head.mp3'));
    expect(track6.TITLE).toBe('(My Doc Told Me I Had) Doggie Head');
  });

  it('restores the release ID that the old mp3 writer lost, from info.txt', async () => {
    // As left by 81963c0/43bd432: fully tagged, master ID present, release ID gone,
    // comment unreadable as a URL.
    for (const name of await fs.readdir(layout.albumPath)) {
      const f = path.join(layout.albumPath, name);
      await fs.writeFile(
        f,
        JSON.stringify({
          ...(await readFake(f)),
          TITLE: name.replace(/^\d+ - |\.mp3$/g, ''),
          ARTIST: 'Yezda Urfa',
          ALBUM: 'Sacred Baboon',
          DATE: '1976',
          TRACKNUMBER: `${parseInt(name, 10)}/7`,
          DISCOGS_MASTER_ID: '245487',
        }),
      );
    }
    await fs.writeFile(
      path.join(layout.albumPath, 'info.txt'),
      'Yezda Urfa\n\nDiscogs-Release: 4376665\nDiscogs-Master: 245487\n',
    );

    const audit = await scan();
    expect(audit.issues.map((i) => i.code)).toEqual(['MISSING_RELEASE_ID']);
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockClear();
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // [1] Write release ID 4376665 (from info.txt)
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/Write release ID 4376665 \(from info\.txt\)/);
    // A full retag from a release of your choice is offered too, suggesting the found ID.
    expect(output.join('\n')).toMatch(/\[2\] Tag from Discogs release ID \(suggested: 4376665, from info\.txt\)/);
    expect(fetchRelease).not.toHaveBeenCalled(); // [1] needs no Discogs call
    expect(audit.issues).toEqual([]);
    const track1 = await readFake(path.join(layout.albumPath, "01 - Give'em Some Rawhide Chewies.mp3"));
    expect(track1).toMatchObject({
      DISCOGS_RELEASE_ID: '4376665',
      DISCOGS_MASTER_ID: '245487',
      COMMENT: 'https://www.discogs.com/release/4376665',
    });
  });
});

describe('repairAlbum — start the album over', () => {
  const albumHeaders = () => output.filter((l) => l.includes('📁')).length;

  it("o at the release ID prompt goes back to the album's opening table", async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → [1] Tag from Discogs
      [/Release ID/, 'o'], // regret
      [/^ {2}Choice \[1\]/, 's'], // MISSING_TAGS again, from the top
      [/Brackets:/, ''], // first skip in the album: no bracket added
      [/^ {2}Choice \[1\]/, 's'], // NAME_TAG_MISMATCH
      [/\[r\] Retry/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(albumHeaders()).toBe(2);
    expect(output.join('\n')).toMatch(/Starting this album over/);
    expect(output.join('\n')).toMatch(/\[o\] Start album over/);
    expect(events.map((e) => e.issue)).toEqual(['RESTART', 'MISSING_TAGS', 'NAME_TAG_MISMATCH']);
  });

  it('drops a pending folder rename; tags already written stay', async () => {
    const audit = await scan();
    audit.discogsResults = [
      {
        id: 4376665,
        title: 'Yezda Urfa - Sacred Baboon',
        year: '1989',
        releaseUrl: 'https://www.discogs.com/release/4376665',
      },
    ];
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → Discogs
      [/Release ID \[4376665\]/, ''],
      [/Apply renames\?/, 'n'], // so track 1's file name disagrees with its new title
      [/Rename folder\(s\) to match Discogs\?/, 'y'], // 1976 → 1989, pending
      [/Old year \[Enter\/l\/r\/c\]/, ''], // no bracket
      [/^ {2}Choice \[1\]/, 'o'], // at the track 1 mismatch: regret
      [/^ {2}Choice \[1\]/, 's'], // the mismatch, shown from the top again
      [/Brackets:/, ''], // first skip in the album: no bracket added
      [/\[r\] Retry/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(albumHeaders()).toBe(2);
    expect(layout.albumFolder).toBe('1976 Sacred Baboon'); // rename dropped
    await expect(fs.access(path.join(root, 'Y', 'Yezda Urfa', '1989 Sacred Baboon'))).rejects.toThrow();
    const track1 = await readFake(path.join(layout.albumPath, "01 - Give'em Some Rawhide Chewies.mp3"));
    expect(track1).toMatchObject({ TITLE: "Give 'Em Some Rawhide Chewies", DISCOGS_RELEASE_ID: '4376665' });
    expect(events.map((e) => e.issue)).toEqual(['MISSING_TAGS', 'RESTART', 'NAME_TAG_MISMATCH']);
  });

  it('without a re-scan, starting over brings back the issues the album started with', async () => {
    const audit = await scan();
    audit.issues = audit.issues.filter((i) => i.code === 'NAME_TAG_MISMATCH');
    const done = answer([
      [/^ {2}Choice \[1\]/, 'o'], // restarts
      [/^ {2}Choice \[1\]/, 'q'],
    ]);
    expect(await repairAlbum(audit, ctx(false))).toBe('quit');
    done();
    expect(audit.issues.map((i) => i.code)).toEqual(['NAME_TAG_MISMATCH']);
  });
});

// Fully tagged (no Discogs IDs unless given), with the file names as titles except track 6.
async function tagAll(extra: Record<string, string> = {}) {
  for (const name of await fs.readdir(layout.albumPath)) {
    const f = path.join(layout.albumPath, name);
    await fs.writeFile(
      f,
      JSON.stringify({
        ...(await readFake(f)),
        ARTIST: 'Yezda Urfa',
        ALBUM: 'Sacred Baboon',
        DATE: '1976',
        TRACKNUMBER: `${parseInt(name, 10)}/7`,
        ...extra,
      }),
    );
  }
}

describe('repairAlbum — choosing the exact Discogs release', () => {
  it('MISSING_RELEASE_ID with nothing to restore from offers a Discogs retag', async () => {
    await tagAll({ DISCOGS_MASTER_ID: '245487' });
    const audit = await scan();
    expect(audit.issues.map((i) => i.code)).toEqual(['NAME_TAG_MISMATCH', 'MISSING_RELEASE_ID']);
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockClear();
    const done = answer([
      [/^ {2}Choice \[1\]/, 's'], // NAME_TAG_MISMATCH
      [/Brackets:/, ''], // first skip in the album: no bracket added
      [/^ {2}Choice \[1\]/, ''], // MISSING_RELEASE_ID: the only action, [1] Tag from Discogs release ID
      [/Release ID \[enter ID\]/, '[r1886376]'],
      [/Apply renames\?/, 'y'], // else track 1's file name disagrees with the Discogs title
      [/Rename folder\(s\) to match Discogs\?/, 'n'],
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/\[1\] Tag from Discogs release ID\n/);
    expect(fetchRelease).toHaveBeenCalledWith('1886376', 'test-token');
    const track6 = await readFake(path.join(layout.albumPath, '06 - (My Doc Told Me I Had) Doggie Head.mp3'));
    expect(track6).toMatchObject({
      TITLE: '(My Doc Told Me I Had) Doggie Head',
      DISCOGS_RELEASE_ID: '1886376',
      DISCOGS_MASTER_ID: '123456',
      COMMENT: 'https://www.discogs.com/release/1886376',
    });
    // The retag also fixed the skipped name/tag mismatch.
    expect(audit.issues).toEqual([]);
  });

  it('[d] retags from a chosen release on any issue', async () => {
    await tagAll();
    const audit = await scan();
    expect(audit.issues.map((i) => i.code)).toEqual(['NAME_TAG_MISMATCH']);
    const done = answer([
      [/^ {2}Choice \[1\]/, 'd'],
      [/Release ID \[enter ID\]/, '1886376'],
      [/Apply renames\?/, 'y'], // else track 1's file name disagrees with the Discogs title
      [/Rename folder\(s\) to match Discogs\?/, 'n'],
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/\[d\] Tag from Discogs release/);
    expect(events.map((e) => [e.issue, e.action, e.result])).toEqual([
      ['NAME_TAG_MISMATCH', 'Tagged from Discogs release 1886376', 'fixed'],
    ]);
    const track1 = await readFake(path.join(layout.albumPath, "01 - Give 'Em Some Rawhide Chewies.mp3"));
    expect(track1).toMatchObject({ DISCOGS_RELEASE_ID: '1886376', DISCOGS_MASTER_ID: '123456' });
  });

  it('suggests the release the album is already tagged with', async () => {
    await tagAll({ DISCOGS_RELEASE_ID: '1886376' });
    const audit = await scan();
    audit.discogsResults = [
      {
        id: 10152054,
        title: 'Yezda Urfa - Sacred Baboon',
        year: '1991',
        releaseUrl: 'https://www.discogs.com/release/10152054',
      },
    ];
    const done = answer([
      [/^ {2}Choice \[1\]/, 'd'],
      [/Release ID \[1886376\]/, ''], // Enter keeps the tagged release, not the search hit
      [/Apply renames\?/, 'y'], // else track 1's file name disagrees with the Discogs title
      [/Rename folder\(s\) to match Discogs\?/, 'n'],
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    const { fetchRelease } = await import('./discogs.js');
    expect(fetchRelease).toHaveBeenLastCalledWith('1886376', 'test-token');
  });
});

// Yes – Yessongs, ripped from the 3×LP into two folders: Disc 1∕2 (8) and Disc 2∕2 (7).
const YESSONGS = [
  ['A1', 'Opening (Excerpt From "Firebird Suite")'],
  ['A2', 'Siberian Khatru'],
  ['A3', 'Heart Of The Sunrise'],
  ['B1', 'Perpetual Change'],
  ['B2', 'And You And I'],
  ['C1', 'Mood For A Day'],
  ['C2', 'Excerpts From The Six Wives Of Henry VIII'],
  ['C3', 'Roundabout'],
  ['D1', 'Your Move'],
  ['D2', "I've Seen All Good People"],
  ['D3', 'Long Distance Runaround'],
  ['D4', 'The Fish'],
  ['E', 'Close To The Edge'],
  ['F1', 'Yours Is No Disgrace'],
  ['F2', 'Starship Trooper'],
];
const YESSONGS_RELEASE: ReleaseInfo = {
  releaseId: '8270054',
  masterId: 35063,
  year: '1973',
  releaseYear: '1973',
  title: 'Yessongs',
  artists: ['Yes'],
  tracklist: YESSONGS.map(([position, title]) => ({ position, title, type_: 'track' })),
};

describe('repairAlbum — one disc of an album split into disc folders', () => {
  let disc2: AlbumLayout;

  beforeEach(async () => {
    const artistDir = path.join(root, 'Y', 'Yes');
    const disc1Path = path.join(artistDir, '1973 Yessongs (Disc 1∕2)');
    const disc2Path = path.join(artistDir, '1973 Yessongs (Disc 2∕2)');
    await fs.mkdir(disc1Path, { recursive: true });
    await fs.mkdir(disc2Path, { recursive: true });
    // Disc 1 was tagged earlier from the 3×LP.
    for (const [i, [, title]] of YESSONGS.slice(0, 8).entries()) {
      await fs.writeFile(path.join(disc1Path, `${String(i + 1).padStart(2, '0')} - ${title}.mp3`), '{}');
    }
    await fs.writeFile(path.join(disc1Path, 'info.txt'), 'Yes\n\nDiscogs-Release: 8270054\nDisc: 1/2\n');
    // Disc 2: titles only, so MISSING_TAGS.
    for (const [i, [, title]] of YESSONGS.slice(8).entries()) {
      await fs.writeFile(
        path.join(disc2Path, `${String(i + 1).padStart(2, '0')} - ${title}.mp3`),
        JSON.stringify({ TITLE: title }),
      );
    }
    disc2 = { letterDir: 'Y', artistName: 'Yes', albumFolder: '1973 Yessongs (Disc 2∕2)', albumPath: disc2Path };
  });

  const disc2Ctx = () => ({ ...ctx(), reaudit: (l: AlbumLayout) => auditAlbum(l, { skipDiscogs: true }) });

  it('suggests disc 1’s release and tags disc 2 with release tracks 9–15', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
    const audit = await auditAlbum(disc2, { skipDiscogs: true });
    expect(audit.issues.map((i) => i.code)).toEqual(['MISSING_TAGS']);
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // [1] Tag from Discogs release ID (suggested: 8270054, from the other disc folder)
      [/Use the same release ID \[r8270054\] as Disc 1\? \[Y\/n\]/, ''],
      [/\[Enter\] OK {3}\[n\] Start at another track/, ''],
      // Already "01 - Your Move.mp3": no renames in a disc folder.
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
    done();
    const out = output.join('\n');
    expect(out).toMatch(/suggested: 8270054, from the other disc folder/);
    expect(out).toMatch(/Disc 2∕2 → release tracks 9–15 of 15 \(D1 Your Move … Starship Trooper\), \d+% title match/);
    expect(out).not.toMatch(/more track\(s\)/); // compared with disc 2's 7 tracks, not all 15
    const first = await readFake(path.join(disc2.albumPath, '01 - Your Move.mp3'));
    expect(first).toMatchObject({
      TITLE: 'Your Move',
      TRACKNUMBER: '1/7',
      DISCNUMBER: '2/2',
      DISCOGS_RELEASE_ID: '8270054',
    });
    const last = await readFake(path.join(disc2.albumPath, '07 - Starship Trooper.mp3'));
    expect(last).toMatchObject({ TITLE: 'Starship Trooper', TRACKNUMBER: '7/7', DISCNUMBER: '2/2' });
    expect(await fs.readFile(path.join(disc2.albumPath, 'info.txt'), 'utf8')).toMatch(/Disc: 2\/2/);
  });

  it('[n] to the same release asks for another, not suggesting disc 1’s', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
    const audit = await auditAlbum(disc2, { skipDiscogs: true });
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Use the same release ID \[r8270054\] as Disc 1\?/, 'n'],
      [/Release ID \[enter ID\]/, '8270054'],
      [/\[Enter\] OK {3}\[n\] Start at another track/, ''],
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
    done();
    expect(vi.mocked(fetchRelease)).toHaveBeenLastCalledWith('8270054', 'test-token');
  });

  describe("disc 1's brackets", () => {
    // Disc 1 was given "[bootleg]" when it was repaired.
    beforeEach(async () => {
      const artistDir = path.join(root, 'Y', 'Yes');
      await fs.rename(
        path.join(artistDir, '1973 Yessongs (Disc 1∕2)'),
        path.join(artistDir, '1973 Yessongs (Disc 1∕2) [bootleg]'),
      );
      const flac = path.join(artistDir, '1973 Yessongs (Disc 2∕2) [FLAC]');
      await fs.rename(disc2.albumPath, flac);
      Object.assign(disc2, { albumFolder: '1973 Yessongs (Disc 2∕2) [FLAC]', albumPath: flac });
    });

    it.each([
      ['', '1973 Yessongs (Disc 2∕2) [FLAC]'],
      ['d', '1973 Yessongs (Disc 2∕2) [bootleg]'],
      ['c', '1973 Yessongs (Disc 2∕2) [FLAC] [bootleg]'],
    ])('after the same release: "%s" → %s', async (choice, folder) => {
      const { fetchRelease } = await import('./discogs.js');
      vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
      const audit = await auditAlbum(disc2, { skipDiscogs: true });
      const done = answer([
        [/^ {2}Choice \[1\]/, ''],
        [/Use the same release ID \[r8270054\] as Disc 1\? \[Y\/n\]/, ''],
        [/Brackets \[Enter\/d\/c\]/, choice],
        ...(choice === 'c' ? [[/ {4}Brackets: /, '[FLAC] bootleg'] as [RegExp, string]] : []),
        [/\[Enter\] OK {3}\[n\] Start at another track/, ''],
        [/Next album/, ''],
      ]);
      expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
      done();
      const out = output.join('\n');
      expect(out).toMatch(/Brackets differ from Disc 1's:/);
      expect(out).toMatch(/\[Enter\] keep +→ 1973 Yessongs \(Disc 2∕2\) \[FLAC\]/);
      expect(out).toMatch(/d {2}as Disc 1 +→ 1973 Yessongs \(Disc 2∕2\) \[bootleg\]/);
      if (choice === 'c') expect(prefills[asked.findIndex((q) => / {4}Brackets: /.test(q))]).toBe('[FLAC]');
      expect(disc2.albumFolder).toBe(folder);
      expect(await fs.readdir(path.join(root, 'Y', 'Yes'))).toContain(folder);
    });

    it('are offered at the first skip too', async () => {
      const audit = await auditAlbum(disc2, { skipDiscogs: true });
      const done = answer([
        [/^ {2}Choice \[1\]/, 's'], // MISSING_TAGS
        [/Brackets \[Enter\/d\/c\]/, 'd'],
        [/\[r\] Retry/, ''],
      ]);
      expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
      done();
      expect(disc2.albumFolder).toBe('1973 Yessongs (Disc 2∕2) [bootleg]');
    });

    it('are not asked about when they are the same', async () => {
      const artistDir = path.join(root, 'Y', 'Yes');
      const same = path.join(artistDir, '1973 Yessongs (Disc 2∕2) [bootleg]');
      await fs.rename(disc2.albumPath, same);
      Object.assign(disc2, { albumFolder: '1973 Yessongs (Disc 2∕2) [bootleg]', albumPath: same });
      const { fetchRelease } = await import('./discogs.js');
      vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
      const audit = await auditAlbum(disc2, { skipDiscogs: true });
      const done = answer([
        [/^ {2}Choice \[1\]/, ''],
        [/Use the same release ID/, 'y'],
        [/\[Enter\] OK {3}\[n\] Start at another track/, ''],
        [/Next album/, ''],
      ]);
      expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
      done();
      expect(disc2.albumFolder).toBe('1973 Yessongs (Disc 2∕2) [bootleg]');
    });
  });

  it('renames "d2t01 - …" files in a disc folder to "01 - Title"', async () => {
    for (const name of await fs.readdir(disc2.albumPath)) {
      await fs.rename(path.join(disc2.albumPath, name), path.join(disc2.albumPath, `d2t${name}`));
    }
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
    const audit = await auditAlbum(disc2, { skipDiscogs: true });
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Use the same release ID \[r8270054\] as Disc 1\? \[Y\/n\]/, ''],
      [/\[Enter\] OK {3}\[n\] Start at another track/, ''],
      [/Apply renames\?/, 'y'],
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
    done();
    const names = (await fs.readdir(disc2.albumPath)).filter((n) => n.endsWith('.mp3')).sort();
    expect(names[0]).toBe('01 - Your Move.mp3');
    expect(names.every((n) => /^\d\d - /.test(n))).toBe(true);
    expect(await readFake(path.join(disc2.albumPath, '01 - Your Move.mp3'))).toMatchObject({
      TRACKNUMBER: '1/7',
      DISCNUMBER: '2/2',
    });
  });

  it('keeps "d1t01 - …" names when one folder holds the files of several discs', async () => {
    const both = path.join(root, 'Y', 'Yes', '1973 Yessongs');
    await fs.mkdir(both);
    for (const [i, [, title]] of YESSONGS.entries()) {
      const [disc, no] = i < 8 ? [1, i + 1] : [2, i - 7];
      await fs.writeFile(path.join(both, `d${disc}t${String(no).padStart(2, '0')}. ${title}.mp3`), '{}');
    }
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
    const audit = await auditAlbum({ ...disc2, albumFolder: '1973 Yessongs', albumPath: both }, { skipDiscogs: true });
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Release ID/, '8270054'],
      [/Apply renames\?/, 'y'],
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
    done();
    const names = (await fs.readdir(both)).filter((n) => n.endsWith('.mp3')).sort();
    expect(names[0]).toBe('d1t01 - Opening (Excerpt From Firebird Suite).mp3');
    expect(names[8]).toBe('d2t01 - Your Move.mp3');
  });

  it('[n] moves the disc to another start track', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
    const audit = await auditAlbum(disc2, { skipDiscogs: true });
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Use the same release ID \[r8270054\] as Disc 1\? \[Y\/n\]/, ''],
      [/\[n\] Start at another track/, 'n'],
      [/Disc 2∕2 starts at release track \(1–15\)/, '20'], // out of range → ask again
      [/\[n\] Start at another track/, 'n'],
      [/Disc 2∕2 starts at release track/, '9'],
      [/\[n\] Start at another track/, ''],
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
    done();
    expect(await readFake(path.join(disc2.albumPath, '01 - Your Move.mp3'))).toMatchObject({ TITLE: 'Your Move' });
  });

  it('without titles or the other disc folder, asks where the disc starts', async () => {
    await fs.rm(path.join(root, 'Y', 'Yes', '1973 Yessongs (Disc 1∕2)'), { recursive: true });
    for (const name of await fs.readdir(disc2.albumPath)) await fs.writeFile(path.join(disc2.albumPath, name), '{}');
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
    const audit = await auditAlbum(disc2, { skipDiscogs: true });
    // Titles come from the file names, so blank the parsed names too.
    audit.tracks = audit.tracks.map((t) => ({ ...t, parsedName: undefined }));
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Release ID \[enter ID\]/, '8270054'],
      [/Disc 2∕2 starts at release track \(1–15\)/, ''], // no answer → skip
      [/\[r\] Retry/, ''],
    ]);
    expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/neither the titles nor the other disc folders tell where Disc 2∕2 starts/);
    expect(await readFake(path.join(disc2.albumPath, '01 - Your Move.mp3'))).toEqual({});
  });
});

// Release 11198316 as fetchRelease returns it (headings "Medley:" and "-----" dropped):
// two CDs, 1-1…1-11 and 2-1…2-8, for one folder of 19 files.
const MADRIGAL_TRACKS: Array<[string, string]> = [
  ['1-1', 'Opening/Siberian Khatru'],
  ['1-2', 'Heart Of The Sunrise'],
  ['1-3', 'A) Future Times / B) Rejoice'],
  ['1-4', 'Circus Of Heaven'],
  ['1-5', 'Time And A Word'],
  ['1-6', 'Long Distance Runaround'],
  ['1-7', 'The Fish (Include Survival Ritual)'],
  ['1-8', 'Perpetual Change '],
  ['1-9', 'The Gates Of Delirium (Soon)'],
  ['1-10', "Don't Kill The Whale"],
  ['1-11', 'Madrigal/The Clap'],
  ['2-1', 'Starship Trooper'],
  ['2-2', 'Rick Wakeman Solo Include Catherine Of Aragon, Catherine Howard, The Battle'],
  ['2-3', 'Awaken'],
  ['2-4', "I've Seen All Good People"],
  ['2-5', 'Roundabout'],
  ['2-6', 'Madrigal'],
  ['2-7', 'On The Silent Wings Of Freedom'],
  ['2-8', 'And You And I '],
];
const MADRIGAL_RELEASE: ReleaseInfo = {
  releaseId: '11198316',
  year: '1978',
  releaseYear: '1997',
  title: 'Madrigal Mystery Tour',
  artists: ['Yes'],
  tracklist: MADRIGAL_TRACKS.map(([position, title]) => ({ position, title, type_: 'track' })),
};
// The file names as they were, with artist and album on every one.
const MADRIGAL_FILES = [
  'Opening_-_Siberian_Khatru',
  'Heart_Of_The_Sunrise',
  'Future_Times_-_Rejoice',
  'Circus_Of_Heaven',
  'Time_And_A_Word',
  'Long_Distance_Runaround',
  'The_Fish',
  'Perpetual_Change',
  'Soon',
  "Don't_Kill_The_Whale",
  'Madrigal_-_Clap',
  'Starship_Trooper',
  'Rick_Wakeman_Solo',
  'Awaken',
  "I've_Seen_All_Good_People",
  'Roundabout',
  'Madrigal',
  'On_The_Silent_Wings_Of_Freedom',
  'And_You_And_I',
].map((t, i) => `Yes_-_Madrigal_Mystery_Tour_-_${String(i + 1).padStart(2, '0')}_-_${t}.mp3`);

describe('repairAlbum — file names with artist and album, a 2-CD release in one folder', () => {
  let madrigal: AlbumLayout;

  beforeEach(async () => {
    const albumPath = path.join(root, 'Y', 'Yes', '1978 Madrigal Mystery Tour');
    await fs.mkdir(albumPath, { recursive: true });
    for (const name of MADRIGAL_FILES) await fs.writeFile(path.join(albumPath, name), '{}');
    madrigal = { letterDir: 'Y', artistName: 'Yes', albumFolder: '1978 Madrigal Mystery Tour', albumPath };
  });

  it('parses the track number after the shared artist and album', async () => {
    const audit = await auditAlbum(madrigal, { skipDiscogs: true });
    expect(audit.tracks[0].parsedName).toBe('Opening - Siberian Khatru');
    expect(audit.tracks[16].parsedName).toBe('Madrigal');
  });

  it('tags each file with its own release track, CD 2 included, and renames them', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(MADRIGAL_RELEASE);
    const audit = await auditAlbum(madrigal, { skipDiscogs: true });
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Release ID \[enter ID\]/, '11198316'],
      [/Apply renames\?/, 'y'],
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(output.join('\n')).not.toMatch(/don't line up|would overwrite/);

    const names = (await fs.readdir(madrigal.albumPath)).filter((n) => n.endsWith('.mp3')).sort();
    expect(names).toHaveLength(19);
    expect(names[0]).toBe('01 - Opening - Siberian Khatru.mp3');
    expect(names[2]).toBe('03 - A) Future Times - B) Rejoice.mp3');
    expect(names[11]).toBe('12 - Starship Trooper.mp3');
    expect(await readFake(path.join(madrigal.albumPath, '12 - Starship Trooper.mp3'))).toMatchObject({
      TITLE: 'Starship Trooper',
      TRACKNUMBER: '12/19',
      DISCNUMBER: '1/1',
      DISCOGS_RELEASE_ID: '11198316',
    });
    expect(await readFake(path.join(madrigal.albumPath, '19 - And You And I.mp3'))).toMatchObject({
      TITLE: 'And You And I',
      TRACKNUMBER: '19/19',
    });
  });

  it('stops before tagging when the titles do not line up', async () => {
    const { fetchRelease } = await import('./discogs.js');
    // A release whose tracks all have one title: every file would get it.
    vi.mocked(fetchRelease).mockResolvedValueOnce({
      ...MADRIGAL_RELEASE,
      tracklist: MADRIGAL_RELEASE.tracklist.map((t) => ({ ...t, title: 'Opening/Siberian Khatru' })),
    });
    const audit = await auditAlbum(madrigal, { skipDiscogs: true });
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Release ID \[enter ID\]/, '11198316'],
      [/Tag anyway\? \[y\/N\]/, ''],
      [/\[r\] Retry/, ''],
    ]);
    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/titles don't line up: 19 files would get a title another file also gets/);
    expect(await readFake(path.join(madrigal.albumPath, MADRIGAL_FILES[1]))).toEqual({});
  });
});

// Discogs release 8082437: 15 tracks. The folder has 17 mp3s: a stray second rip of
// tracks 1 and 3, without a track number in the name.
const ART_DECO_TITLES = [
  'The Frim-Fram Sauce',
  'Song Two',
  'April Showers',
  'Song Four',
  'Song Five',
  'Song Six',
  'Song Seven',
  'Song Eight',
  'Song Nine',
  'Song Ten',
  'Song Eleven',
  'Song Twelve',
  'Song Thirteen',
  'Song Fourteen',
  'Song Fifteen',
];
const ART_DECO_RELEASE: ReleaseInfo = {
  releaseId: '8082437',
  year: '1985',
  releaseYear: '1985',
  title: 'Art Deco',
  artists: ['Ytre Suløens Jass-Ensemble'],
  tracklist: ART_DECO_TITLES.map((title, i) => ({ position: String(i + 1), title, type_: 'track' })),
};

describe('repairAlbum — a stray second copy of two tracks (Art Deco)', () => {
  let artDeco: AlbumLayout;

  beforeEach(async () => {
    const albumPath = path.join(root, 'Y', 'Ytre Suløens Jass-Ensemble', '1985 Art Deco');
    await fs.mkdir(albumPath, { recursive: true });
    for (const [i, t] of ART_DECO_TITLES.entries())
      await fs.writeFile(path.join(albumPath, `${String(i + 1).padStart(2, '0')} - ${t}.mp3`), '{}');
    await fs.writeFile(path.join(albumPath, 'The Frim-Fram Sauce.mp3'), '{}');
    await fs.writeFile(path.join(albumPath, 'April Showers.mp3'), '{}');
    artDeco = { letterDir: 'Y', artistName: 'Ytre Suløens Jass-Ensemble', albumFolder: '1985 Art Deco', albumPath };
  });

  it('finds both pairs before tagging, naming the unnumbered file', async () => {
    const audit = await auditAlbum(artDeco, { skipDiscogs: true });
    const dupes = audit.issues.filter((i) => i.code === 'DUPLICATE_TRACKS').map((i) => i.message);
    expect(dupes).toEqual([
      expect.stringMatching(/"The Frim-Fram Sauce" appears 2×.*likely extra copy: The Frim-Fram Sauce\.mp3$/),
      expect.stringMatching(/"April Showers" appears 2×.*likely extra copy: April Showers\.mp3$/),
    ]);
  });

  it('tags the 15 release tracks n/15 and leaves the two extra copies untagged', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(ART_DECO_RELEASE);
    const audit = await auditAlbum(artDeco, { skipDiscogs: true });
    expect(audit.issues[0].code).toBe('NO_TAGS');
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // NO_TAGS → Discogs
      [/Release ID \[enter ID\]/, '8082437'], // no "fewer tracks" question: 15 vs 15
      [/^ {2}Choice \[1\]/, 's'], // NO_TAGS: the 2 extra copies, left untagged
      [/Brackets:/, ''], // first skip in the album: no bracket added
      [/^ {2}Choice \[1\]/, 's'], // DUPLICATE_TRACKS ×2, still there after the re-scan
      [/^ {2}Choice \[1\]/, 's'],
      [/\[r\] Retry/, ''],
    ]);
    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    const out = output.join('\n');
    expect(out).toMatch(/April Showers\.mp3 looks like an extra copy of 03 - April Showers\.mp3: not tagged/);
    expect(out).toMatch(/The Frim-Fram Sauce\.mp3 looks like an extra copy of 01 - The Frim-Fram Sauce\.mp3/);
    expect(out).not.toMatch(/fewer track/);
    expect(await readFake(path.join(artDeco.albumPath, '15 - Song Fifteen.mp3'))).toMatchObject({
      TITLE: 'Song Fifteen',
      TRACKNUMBER: '15/15',
    });
    expect(await readFake(path.join(artDeco.albumPath, '03 - April Showers.mp3'))).toMatchObject({
      TRACKNUMBER: '3/15',
    });
    expect(await readFake(path.join(artDeco.albumPath, 'April Showers.mp3'))).toEqual({});
    expect(await readFake(path.join(artDeco.albumPath, 'The Frim-Fram Sauce.mp3'))).toEqual({});
  });
});

describe('repairAlbum — year change keeps the old year in a bracket, one answer per set', () => {
  const discLayout = async (n: number): Promise<AlbumLayout> => {
    const albumFolder = `1979 Tourmato (Disc ${n}∕2) [FLAC]`;
    const albumPath = path.join(root, 'Y', 'Yes', albumFolder);
    await fs.mkdir(albumPath, { recursive: true });
    await fs.writeFile(path.join(albumPath, '01 - Song.mp3'), JSON.stringify({ TITLE: 'Song', DATE: '1979' }));
    await fs.writeFile(path.join(albumPath, 'info.txt'), 'Yes - Tourmato\n\nMy own notes\n');
    return { letterDir: 'Y', artistName: 'Yes', albumFolder, albumPath };
  };
  const yearAudit = async (l: AlbumLayout): Promise<AlbumAudit> => ({
    ...(await auditAlbum(l, { skipDiscogs: true })),
    issues: [
      { severity: 'HIGH', code: 'YEAR_NOT_ORIGINAL', message: 'Year 1979 is not the original release year 1992' },
    ],
    originalYear: { releaseId: '1', year: '1992' },
  });

  it('asks once, with the old year filled in, and gives disc 2 the same bracket', async () => {
    const disc1 = await discLayout(1);
    const disc2 = await discLayout(2);
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // [1] Set DATE/ORIGINALDATE to 1992 and rename folder
      [/Old year \[Enter\/l\/r\/c\]/, 'l'],
      [/Next album/, ''],
      [/^ {2}Choice \[1\]/, ''], // disc 2: no Old year question
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(await yearAudit(disc1), ctx(false))).toBe('next');
    expect(await repairAlbum(await yearAudit(disc2), ctx(false))).toBe('next');
    done();

    const out = output.join('\n');
    expect(out).toMatch(/Year 1979 → 1992\. Keep the old year in the folder name\?/);
    expect(out).toMatch(/l {2}live +→ 1992 Tourmato \(Disc 1∕2\) \[FLAC\] \[live 1979\]/);
    expect(out).toMatch(/Old year: \[live 1979\] \(as for the other disc of this set\)/);
    expect(disc1.albumFolder).toBe('1992 Tourmato (Disc 1∕2) [FLAC] [live 1979]');
    expect(disc2.albumFolder).toBe('1992 Tourmato (Disc 2∕2) [FLAC] [live 1979]');

    // Folder name only: the tags get the year, never the bracket.
    expect(await readFake(path.join(disc1.albumPath, '01 - Song.mp3'))).toMatchObject({
      DATE: '1992',
      ORIGINALDATE: '1992',
    });
    expect(events.map((e) => e.action)).toEqual([
      'Set DATE/ORIGINALDATE to 1992 and rename folder → "1992 Tourmato (Disc 1∕2) [FLAC] [live 1979]"',
      'Set DATE/ORIGINALDATE to 1992 and rename folder → "1992 Tourmato (Disc 2∕2) [FLAC] [live 1979]"',
    ]);
    const info = await fs.readFile(path.join(disc2.albumPath, 'info.txt'), 'utf8');
    expect(info).toMatch(
      /^Yes - Tourmato\n\nMy own notes\n\n={15}Changeset={14}\n\[[\d :-]+\]: folder name was changed from "1979 Tourmato \(Disc 2∕2\) \[FLAC\]" to "1992 Tourmato \(Disc 2∕2\) \[FLAC\] \[live 1979\]"\n$/,
    );
  });

  it('c puts the folder’s brackets in the input to edit; the result replaces them', async () => {
    const disc1 = await discLayout(1);
    const disc2 = await discLayout(2);
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Old year/, 'c'],
      [/ {4}Brackets: /, '[FLAC] [Philadelphia 1979]'], // "[FLAC]" was in the line; the user added to it
      [/Next album/, ''],
      [/^ {2}Choice \[1\]/, ''], // disc 2: same answer, no questions
      [/Next album/, ''],
    ]);
    await repairAlbum(await yearAudit(disc1), ctx(false));
    await repairAlbum(await yearAudit(disc2), ctx(false));
    done();
    expect(prefills[asked.findIndex((q) => /Brackets: /.test(q))]).toBe('[FLAC]');
    expect(output.join('\n')).toMatch(/c {2}custom text +→ edit "\[FLAC\]"/);
    expect(disc1.albumFolder).toBe('1992 Tourmato (Disc 1∕2) [FLAC] [Philadelphia 1979]');
    expect(disc2.albumFolder).toBe('1992 Tourmato (Disc 2∕2) [FLAC] [Philadelphia 1979]');
  });

  it('c can replace the bracket, or drop it', async () => {
    const disc1 = await discLayout(1);
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Old year/, 'c'],
      [/Brackets: /, 'live 1979'], // "[FLAC]" deleted, plain text typed
      [/Next album/, ''],
    ]);
    await repairAlbum(await yearAudit(disc1), ctx(false));
    done();
    expect(disc1.albumFolder).toBe('1992 Tourmato (Disc 1∕2) [live 1979]');
  });
});

describe('repairAlbum — a bracket for the folder after a skip', () => {
  it('adds [bootleg] to the folder name after the album, asking only at the first skip', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 's'], // MISSING_TAGS: Discogs doesn't list this bootleg
      [/Brackets:/, 'bootleg'],
      [/^ {2}Choice \[1\]/, 's'], // NAME_TAG_MISMATCH: no second question
      [/\[r\] Retry/, ''],
    ]);
    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();

    expect(prefills[1]).toBe(''); // the folder has no brackets to start from
    const newPath = path.join(root, 'Y', 'Yezda Urfa', '1976 Sacred Baboon [bootleg]');
    expect(layout.albumPath).toBe(newPath);
    expect(output.join('\n')).toMatch(/folder becomes "1976 Sacred Baboon \[bootleg\]" after this album's other fixes/);
    expect(events.at(-1)).toMatchObject({
      issue: 'FOLDER_RENAME',
      action: 'Set folder brackets → "Yezda Urfa/1976 Sacred Baboon [bootleg]"',
      result: 'fixed',
    });
    expect(await fs.readFile(path.join(newPath, 'info.txt'), 'utf8')).toMatch(
      /folder name was changed from "1976 Sacred Baboon" to "1976 Sacred Baboon \[bootleg\]"/,
    );
  });

  it('Enter leaves the folder name as it is', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 's'],
      [/Brackets:/, ''],
      [/^ {2}Choice \[1\]/, 's'],
      [/\[r\] Retry/, ''],
    ]);
    await repairAlbum(audit, ctx());
    done();
    expect(layout.albumFolder).toBe('1976 Sacred Baboon');
    expect(events.map((e) => e.issue)).not.toContain('FOLDER_RENAME');
  });

  it('combines with a Discogs folder rename', async () => {
    const audit = await scan();
    audit.discogsResults = [
      {
        id: 4376665,
        title: 'Yezda Urfa - Sacred Baboon',
        year: '1989',
        releaseUrl: 'https://www.discogs.com/release/4376665',
      },
    ];
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → Discogs
      [/Release ID \[4376665\]/, ''],
      [/Apply renames\?/, 'n'], // leaves a name/tag mismatch to skip
      [/Rename folder\(s\) to match Discogs\?/, 'y'], // 1976 → 1989
      [/Old year \[Enter\/l\/r\/c\]/, 'r'],
      [/^ {2}Choice \[1\]/, 's'], // the mismatch
      [/Brackets:/, 'bootleg'],
      [/\[r\] Retry/, ''],
    ]);
    await repairAlbum(audit, ctx());
    done();
    expect(layout.albumFolder).toBe('1989 Sacred Baboon [bootleg] [rec. 1976]');
    expect(events.find((e) => e.issue === 'FOLDER_RENAME')?.action).toBe(
      'Rename folder(s) to match Discogs → "Yezda Urfa/1989 Sacred Baboon [bootleg] [rec. 1976]"',
    );
  });
});

describe('formatSummary', () => {
  it.each([
    [['01.flac', '02.FLAC', 'cover.jpg', 'info.txt'], { checked: 'FLAC', other: '' }],
    [['1.mp3', '2.flac', '3.flac'], { checked: 'FLAC 2 · MP3 1', other: '' }],
    [['1.flac', '2.wav', '3.wav', '4.m4a'], { checked: 'FLAC 1', other: 'WAV 2 · M4A 1 (not checked)' }],
    [['1.ape', '2.ape'], { checked: '', other: 'APE (not checked)' }],
    [['cover.jpg'], { checked: '', other: '' }],
  ])('%j', (files, expected) => {
    expect(formatSummary(files)).toEqual(expected);
  });
});

describe('repairAlbum — a Discogs artist credit that differs from the artist folder', () => {
  it('moves only this album to the new artist folder; the title differing only in case is no rename', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce({
      ...RELEASE,
      year: '1976',
      title: 'Sacred Baboon (The Rawhide Years)',
      artists: ['Yezda Urfa And Friends'],
    });
    // As in "David Sancious/1976 Transformation (The Speed of Love)": the folder has the full
    // title, with another case; the artist folder holds another album and a cover.
    const artistDir = path.dirname(layout.albumPath);
    const folder = '1976 Sacred Baboon (the Rawhide years)';
    await fs.rename(layout.albumPath, path.join(artistDir, folder));
    Object.assign(layout, { albumFolder: folder, albumPath: path.join(artistDir, folder) });
    await fs.mkdir(path.join(artistDir, '1975 Boris'));
    await fs.writeFile(path.join(artistDir, 'cover.jpg'), '');

    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → Discogs
      [/Release ID/, '4376665'],
      [/^ {2}Artist \[Enter\/k\]: $/, ''], // Discogs' name, for folder and tags
      [/Apply renames\?/, 'y'],
      // The artist folder follows the choice: no second question.
      [/Next album/, ''],
    ]);
    await repairAlbum(audit, ctx());
    done();

    const out = output.join('\n');
    expect(out).toMatch(/Artist folder: "Yezda Urfa" {2}→ {2}"Yezda Urfa And Friends" \(as chosen\)/);
    expect(out).not.toMatch(/album {2}:/);
    const moved = path.join(root, 'Y', 'Yezda Urfa And Friends', folder);
    expect(layout).toMatchObject({ artistName: 'Yezda Urfa And Friends', albumPath: moved });
    expect(out).toMatch(/Yezda Urfa\/ still has 1 album: kept/);
    expect((await fs.readdir(artistDir)).sort()).toEqual(['1975 Boris', 'cover.jpg']);
    expect(await fs.readFile(path.join(moved, 'info.txt'), 'utf8')).toMatch(
      /album was moved from artist folder "Yezda Urfa" to "Yezda Urfa And Friends"/,
    );
  });
});

describe('repairAlbum — an artist under the wrong letter folder', () => {
  it('moves only this album to the artist folder under the right letter, joining the one there', async () => {
    // "Yezda Urfa" filed under X, with another album; Y/Yezda Urfa exists with one album and a cover.
    const wrong = path.join(root, 'X', 'Yezda Urfa');
    await fs.mkdir(path.dirname(wrong), { recursive: true });
    await fs.rename(path.dirname(layout.albumPath), wrong);
    await fs.mkdir(path.join(wrong, '1977 Boris Live'));
    const right = path.join(root, 'Y', 'Yezda Urfa');
    await fs.mkdir(path.join(right, '1975 Boris'), { recursive: true });
    await fs.writeFile(path.join(right, 'cover.jpg'), '');
    Object.assign(layout, { letterDir: 'X', albumPath: path.join(wrong, layout.albumFolder) });

    const audit = await scan();
    audit.issues = audit.issues.filter((i) => i.code === 'WRONG_LETTER_DIR');
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Next album/, ''],
    ]);
    await repairAlbum(audit, ctx(false));
    done();

    const out = output.join('\n');
    expect(out).toMatch(/\[1\] Move "1976 Sacred Baboon" to Y\/Yezda Urfa \(joins the folder there\)/);
    expect(out).toMatch(/X\/Yezda Urfa\/ still has 1 album: kept/);
    expect(layout).toMatchObject({
      letterDir: 'Y',
      artistName: 'Yezda Urfa',
      albumPath: path.join(right, '1976 Sacred Baboon'),
    });
    expect((await fs.readdir(right)).sort()).toEqual(['1975 Boris', '1976 Sacred Baboon', 'cover.jpg']);
    expect(await fs.readdir(wrong)).toEqual(['1977 Boris Live']);
    expect(await fs.readFile(path.join(right, '1976 Sacred Baboon', 'info.txt'), 'utf8')).toMatch(
      /album was moved from artist folder "X\/Yezda Urfa" to "Y\/Yezda Urfa"/,
    );
  });
});

describe("repairAlbum — the artist folder's own brackets", () => {
  // As in "Dionysos [Canada]": the brackets tell same-named artists apart (Discogs' "Dionysos (3)").
  async function underArtist(artist: string): Promise<void> {
    const artistDir = path.join(root, 'Y', artist);
    await fs.rename(path.dirname(layout.albumPath), artistDir);
    Object.assign(layout, { artistName: artist, albumPath: path.join(artistDir, layout.albumFolder) });
  }

  it('are not a difference from the Discogs artist', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce({ ...RELEASE, year: '1976' });
    await underArtist('Yezda Urfa [US]');

    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → Discogs
      [/Release ID/, '4376665'],
      [/Apply renames\?/, 'y'],
      [/Next album/, ''],
    ]);
    await repairAlbum(audit, ctx());
    done();

    expect(output.join('\n')).not.toMatch(/Discogs name differs/);
    expect(layout.artistName).toBe('Yezda Urfa [US]');
  });

  it('are kept when the album moves to the Discogs artist', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce({ ...RELEASE, year: '1976', artists: ['Yezda Urfa And Friends'] });
    await underArtist('Yezda Urfa [US]');

    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → Discogs
      [/Release ID/, '4376665'],
      [/^ {2}Artist \[Enter\/k\]: $/, ''],
      [/Apply renames\?/, 'y'],
      [/Next album/, ''],
    ]);
    await repairAlbum(audit, ctx());
    done();

    expect(output.join('\n')).toMatch(/Artist folder: "Yezda Urfa \[US\]" {2}→ {2}"Yezda Urfa And Friends \[US\]"/);
    const moved = path.join(root, 'Y', 'Yezda Urfa And Friends [US]', '1976 Sacred Baboon');
    expect(layout).toMatchObject({ artistName: 'Yezda Urfa And Friends [US]', albumPath: moved });
    // The tags carry the same name, the folder's bracket included.
    const track = (await fs.readdir(moved)).find((f) => f.endsWith('.mp3'))!;
    expect(await readFake(path.join(moved, track))).toMatchObject({
      ARTIST: 'Yezda Urfa And Friends [US]',
      ALBUMARTIST: 'Yezda Urfa And Friends [US]',
    });
  });
});

describe('splitArtistBrackets', () => {
  it.each([
    ['Dionysos [Canada]', { name: 'Dionysos', brackets: ' [Canada]' }],
    ['Nektar [UK] [band]', { name: 'Nektar', brackets: ' [UK] [band]' }],
    ['Yezda Urfa', { name: 'Yezda Urfa', brackets: '' }],
    ['[Dialogue] Group', { name: '[Dialogue] Group', brackets: '' }],
  ])('%s', (artist, expected) => {
    expect(splitArtistBrackets(artist)).toEqual(expected);
  });
});

describe('repairAlbum — covers', () => {
  it("downloads the release's cover, then copies it to the artist folder", async () => {
    // Fully tagged from release 4376665, but no cover.jpg anywhere.
    for (const [i, name] of (await fs.readdir(layout.albumPath)).sort().entries()) {
      const tags = {
        TITLE: TITLES[i],
        ARTIST: 'Yezda Urfa',
        ALBUMARTIST: 'Yezda Urfa',
        ALBUM: 'Sacred Baboon',
        DATE: '1976',
        TRACKNUMBER: `${i + 1}/7`,
        DISCNUMBER: '1/1',
        DISCOGS_RELEASE_ID: '4376665',
      };
      await fs.rm(path.join(layout.albumPath, name));
      await fs.writeFile(path.join(layout.albumPath, `0${i + 1} - ${TITLES[i]}.mp3`), JSON.stringify(tags));
    }
    const covers = (l: AlbumLayout) => auditAlbum(l, { skipDiscogs: true, checkCovers: true });
    const audit = await covers(layout);
    expect(audit.issues.map((i) => i.code)).toEqual(['MISSING_COVER', 'ARTIST_COVER_MISSING']);

    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_COVER → [1] Download the cover of Discogs release r4376665
      [/^ {2}Choice \[1\]/, ''], // ARTIST_COVER_MISSING → [1] Copy cover.jpg from "1976 Sacred Baboon"
      [/Next album/, ''],
    ]);
    await repairAlbum(audit, { ...ctx(), reaudit: covers });
    done();

    const out = output.join('\n');
    expect(out).toMatch(/\[1\] Download the cover of Discogs release r4376665/);
    expect(out).toMatch(/\[1\] Copy cover\.jpg from "1976 Sacred Baboon" to the artist folder "Yezda Urfa"/);
    const artistDir = path.dirname(layout.albumPath);
    const { downloadImage } = await import('./discogs.js');
    expect(vi.mocked(downloadImage)).toHaveBeenCalledWith('https://i.discogs.com/600');
    const tiny = await fs.readFile(TINY_JPEG);
    expect(await fs.readFile(path.join(layout.albumPath, 'cover.jpg'))).toEqual(tiny);
    expect(await fs.readFile(path.join(artistDir, 'cover.jpg'))).toEqual(tiny);
    expect(await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8')).toMatch(
      /cover\.jpg was set to the cover of Discogs release r4376665/,
    );
    expect(events.map((e) => [e.issue, e.result, e.action])).toEqual([
      ['MISSING_COVER', 'fixed', 'cover.jpg from Discogs release r4376665'],
      ['ARTIST_COVER_MISSING', 'fixed', 'Copy cover.jpg from "1976 Sacred Baboon" to the artist folder "Yezda Urfa"'],
    ]);
    expect(audit.issues).toEqual([]);
  });

  it('offers another image in the folder, and a release or master you enter', async () => {
    await fs.copyFile(TINY_JPEG, path.join(layout.albumPath, 'front.jpg'));
    await fs.copyFile(TINY_JPEG, path.join(path.dirname(layout.albumPath), 'folder.jpg')); // the artist's cover
    const covers = (l: AlbumLayout) => auditAlbum(l, { skipDiscogs: true, checkCovers: true });
    const audit = await covers(layout);
    expect(audit.issues.filter((i) => /COVER/.test(i.code)).map((i) => i.code)).toEqual(['MISSING_COVER']);
    audit.issues = audit.issues.filter((i) => i.code === 'MISSING_COVER');
    const done = answer([
      [/^ {2}Choice \[1\]/, '1'], // [1] Use front.jpg as cover.jpg (no release ID in the tags)
      [/Next album/, ''],
    ]);
    await repairAlbum(audit, { ...ctx(), reaudit: undefined });
    done();
    expect(output.join('\n')).toMatch(/\[2\] Download the cover of a Discogs release or master you enter/);
    const tiny = await fs.readFile(TINY_JPEG);
    expect(await fs.readFile(path.join(layout.albumPath, 'cover.jpg'))).toEqual(tiny);
    expect(await fs.readFile(path.join(layout.albumPath, 'front.jpg'))).toEqual(tiny);
  });

  it('a broken folder.jpg is replaced under its own name, from the good cover.jpg or Discogs', async () => {
    await fs.copyFile(TINY_JPEG, path.join(layout.albumPath, 'cover.jpg'));
    await fs.writeFile(path.join(layout.albumPath, 'folder.jpg'), '<html>');
    await fs.copyFile(TINY_JPEG, path.join(path.dirname(layout.albumPath), 'cover.jpg'));
    const audit: AlbumAudit = {
      layout,
      tracks: [],
      issues: [
        {
          severity: 'MODERATE',
          code: 'BAD_COVER',
          file: 'folder.jpg',
          message: "folder.jpg can't be read as an image",
        },
      ],
    };
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // [1] Replace folder.jpg with a copy of cover.jpg
      [/Next album/, ''],
    ]);
    await repairAlbum(audit, { ...ctx(), reaudit: undefined });
    done();
    expect(output.join('\n')).toMatch(/\[1\] Replace folder\.jpg with a copy of cover\.jpg/);
    expect(await fs.readFile(path.join(layout.albumPath, 'folder.jpg'))).toEqual(await fs.readFile(TINY_JPEG));
  });
});

describe('repairAlbum — Discogs first', () => {
  const first = (extra: object = {}) => ({ ...ctx(), discogsFirst: true, ...extra });
  const pasted = ["1. Give 'Em Some Rawhide Chewies 5:08", ...TITLES.slice(1).map((t, i) => `${i + 2}. ${t}`)];

  it('tags an album without a release ID from Discogs before its issues', async () => {
    const audit = await scan();
    audit.discogsResults = [
      {
        id: 4376665,
        title: 'Yezda Urfa - Sacred Baboon',
        year: '1989',
        releaseUrl: 'https://www.discogs.com/release/4376665',
      },
    ];
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // [1] Tag from Discogs release ID (suggested 4376665)
      [/Release ID \[4376665\]/, ''],
      [/Apply renames\?/, 'y'],
      [/Rename folder\(s\) to match Discogs\?/, 'n'],
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(audit, first())).toBe('next');
    done();
    const out = output.join('\n');
    expect(out).toMatch(/No Discogs release ID yet — tag from Discogs first/);
    expect(out).toMatch(/\[2\] Paste the tracklist/);
    expect(out).toMatch(/\[f\] Fix the 2 issue\(s\) one by one/);
    // Tagging solved both issues: no issue menu came after.
    expect(out).toMatch(/All issues addressed/);
    expect(events.map((e) => [e.issue, e.action, e.result])).toEqual([
      ['DISCOGS', 'Tagged from Discogs release 4376665', 'fixed'],
    ]);
  });

  it('offers pasting first when Discogs finds nothing, and tags from the folder and the list', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // [1] Paste the tracklist
      ...pasted.map((l): [RegExp, string] => [/^$/, l]),
      [/^$/, ''],
      [/Tag 7 file\(s\) like this\? \[Y\/n\]/, ''],
      [/Apply renames\?/, 'y'],
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(audit, first())).toBe('next');
    done();
    const out = output.join('\n');
    expect(out).toMatch(/Discogs search found no match for "Yezda Urfa – 1976 Sacred Baboon"/);
    expect(out).toMatch(/\[2\] Enter a Discogs release ID/);
    const track1 = await readFake(path.join(layout.albumPath, "01 - Give 'Em Some Rawhide Chewies.mp3"));
    expect(track1).toEqual({
      TITLE: "Give 'Em Some Rawhide Chewies",
      ARTIST: 'Yezda Urfa',
      ALBUMARTIST: 'Yezda Urfa',
      ALBUM: 'Sacred Baboon',
      TRACKNUMBER: '1/7',
      DISCNUMBER: '1/1',
      DATE: '1976',
    });
    const info = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8');
    expect(info).toMatch(
      /^Yezda Urfa - Sacred Baboon \(1976\)\n\nSongs\n 1. {3}Give 'Em Some Rawhide Chewies +5:08\n 2. {3}Cancer Of The Band\n/,
    );
    expect(info).toMatch(/Source: pasted tracklist/);
    expect(info).toMatch(/Tagged from a pasted tracklist/);
    expect(events.map((e) => [e.issue, e.action])).toEqual([['DISCOGS', 'Tagged from a pasted tracklist']]);
  });

  it('keeps an info.txt that holds more than the old tags', async () => {
    await fs.writeFile(path.join(layout.albumPath, 'info.txt'), 'Ripped from my own LP, 1998\n');
    const audit = await scan();
    answer([
      [/^ {2}Choice \[1\]/, '1'],
      ...pasted.map((l): [RegExp, string] => [/^$/, l]),
      [/^$/, ''],
      [/Tag 7 file\(s\)/, ''],
      [/Apply renames\?/, 'n'],
      [/./, 'q'],
    ]);
    await repairAlbum(audit, first());
    expect(await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8')).toBe('Ripped from my own LP, 1998\n');
    expect(output.join('\n')).toMatch(/info\.txt kept/);
  });

  it('asks again when the paste is cancelled or the pairing declined', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, '1'],
      [/^$/, ''], // nothing pasted
      [/^ {2}Choice \[1\]/, '1'],
      ...pasted.map((l): [RegExp, string] => [/^$/, l]),
      [/^$/, ''],
      [/Tag 7 file\(s\)/, 'n'],
      [/^ {2}Choice \[1\]/, 'q'],
    ]);
    expect(await repairAlbum(audit, first())).toBe('quit');
    done();
    expect(output.join('\n')).toMatch(/Cancelled — nothing pasted/);
    expect(JSON.parse(await fs.readFile(path.join(layout.albumPath, '02 - Cancer Of The Band.mp3'), 'utf8'))).toEqual({
      TITLE: 'Cancer Of The Band',
    });
  });

  it('[f] goes on to the issues one by one, without tagging', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 'f'],
      [/^ {2}Choice \[1\]/, 'q'], // MISSING_TAGS menu
    ]);
    expect(await repairAlbum(audit, first())).toBe('quit');
    done();
    expect(events.map((e) => [e.issue, e.action])).toEqual([['MISSING_TAGS', 'quit']]);
  });

  it('[s] skips the album, with the bracket question, and goes on without another prompt', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 's'],
      [/Brackets:/, ''],
    ]);
    expect(await repairAlbum(audit, first())).toBe('next');
    done();
    expect(events.map((e) => [e.issue, e.action, e.result])).toEqual([['DISCOGS', 'skipped album', 'skipped']]);
  });

  it('trusts a release ID the album has: straight to its issues', async () => {
    await tagAll({ DISCOGS_RELEASE_ID: '4376665' });
    const audit = await scan();
    expect(audit.releaseId).toBe('4376665');
    const done = answer([[/^ {2}Choice \[1\]/, 'q']]); // the NAME_TAG_MISMATCH menu
    await repairAlbum(audit, first());
    done();
    expect(output.join('\n')).not.toMatch(/Discogs release ID yet|\[retag\]/);
  });

  it('with --retag, offers the album its own release again', async () => {
    await tagAll({ DISCOGS_RELEASE_ID: '4376665' });
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Release ID \[4376665\]/, ''],
      [/Apply renames\?/, 'n'],
      [/Rename folder\(s\) to match Discogs\?/, 'n'],
      [/./, 'q'], // whatever is left
    ]);
    await repairAlbum(audit, first({ retag: true }));
    done();
    const out = output.join('\n');
    expect(out).toMatch(/\[retag\] Tagged from Discogs release 4376665 — tag from Discogs again\?/);
    expect(out).toMatch(/\[1\] Tag from Discogs release ID \(suggested: 4376665, from tags\)/);
  });
});

describe('repairAlbum — one artist name for folder, tags and info.txt', () => {
  // As release 8614313 (Conference Of The Birds): the first credited artist is the quartet,
  // the leader is credited too; the folder and the tags use another spelling.
  const holland = {
    ...RELEASE,
    year: '1976',
    artists: ['David Holland Quartet', 'Dave Holland', 'Sam Rivers'],
    artistCredit: 'David Holland Quartet - Dave Holland, Sam Rivers',
  };

  beforeEach(async () => {
    const dir = path.join(root, 'D', 'Dave Holland Quartet', '1976 Sacred Baboon');
    await fs.mkdir(path.dirname(dir), { recursive: true });
    await fs.rename(layout.albumPath, dir);
    Object.assign(layout, { letterDir: 'D', artistName: 'Dave Holland Quartet', albumPath: dir });
    await tagAll({ ARTIST: 'Dave Holland', ALBUMARTIST: 'Dave Holland' });
  });

  const tagWith = async (choice: string) => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(holland);
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 'd'],
      [/Release ID/, '8614313'],
      [/^ {2}Artist \[Enter\/k\/a\]: $/, choice],
      [/Apply renames\?/, 'n'],
      [/./, 'q'], // whatever issue is left
    ]);
    await repairAlbum(audit, ctx());
    done();
  };
  const tagsOf = async () => {
    const track = (await fs.readdir(layout.albumPath)).find((f) => f.endsWith('.mp3'))!;
    return readFake(path.join(layout.albumPath, track));
  };
  const header = async () => (await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8')).split('\n')[0];

  it('shows the three names and takes Discogs’ on Enter, for folder, tags and info.txt', async () => {
    await tagWith('');
    const out = output.join('\n');
    expect(out).toMatch(
      /Discogs : "David Holland Quartet" {2}\(credits: "David Holland Quartet - Dave Holland, Sam Rivers"\)/,
    );
    expect(out).toMatch(/folder {2}: "Dave Holland Quartet"/);
    expect(out).toMatch(/tags {4}: "Dave Holland"/);
    expect(layout.artistName).toBe('David Holland Quartet');
    expect(await tagsOf()).toMatchObject({ ARTIST: 'David Holland Quartet', ALBUMARTIST: 'David Holland Quartet' });
    expect(await header()).toBe('David Holland Quartet - Sacred Baboon (1976)');
  });

  it('k keeps the folder’s name, also for the tags and info.txt', async () => {
    await tagWith('k');
    expect(layout.artistName).toBe('Dave Holland Quartet');
    expect(await tagsOf()).toMatchObject({ ARTIST: 'Dave Holland Quartet', ALBUMARTIST: 'Dave Holland Quartet' });
    expect(await header()).toBe('Dave Holland Quartet - Sacred Baboon (1976)');
  });

  it('a takes every credit, joined with "," for folder, tags and info.txt alike', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce({
      ...holland,
      artists: ['Patrick Woodroffe', 'Dave Greenslade'],
      artistCredit: 'Patrick Woodroffe, Dave Greenslade',
    });
    const audit = await scan();
    answer([
      [/^ {2}Choice \[1\]/, 'd'],
      [/Release ID/, '4508999'],
      [/^ {2}Artist \[Enter\/k\/a\]: $/, 'a'],
      [/Apply renames\?/, 'n'],
      [/./, 'q'],
    ]);
    await repairAlbum(audit, ctx());
    expect(layout.artistName).toBe('Patrick Woodroffe, Dave Greenslade');
    expect(await tagsOf()).toMatchObject({ ALBUMARTIST: 'Patrick Woodroffe, Dave Greenslade' });
    expect(await header()).toBe('Patrick Woodroffe, Dave Greenslade - Sacred Baboon (1976)');
  });

  it('asks nothing when folder, Discogs and tags agree', async () => {
    await tagAll({ ARTIST: 'Dave Holland Quartet', ALBUMARTIST: 'Dave Holland Quartet' });
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce({ ...RELEASE, year: '1976', artists: ['Dave Holland Quartet'] });
    const audit = await scan();
    answer([
      [/^ {2}Choice \[1\]/, 'd'],
      [/Release ID/, '1'],
      [/Apply renames\?/, 'n'],
      [/./, 'q'],
    ]);
    await repairAlbum(audit, ctx());
    expect(output.join('\n')).not.toMatch(/Artist names differ/);
  });
});

describe('repairAlbum — music-utils artist.sortArticles on', () => {
  const SORTED = { sortArticles: true, articles: ['the'] };
  // The fixture album under "Y/The Yezdas".
  const moveToTheYezdas = async () => {
    const artistDir = path.join(root, 'Y', 'The Yezdas');
    await fs.rename(path.dirname(layout.albumPath), artistDir);
    Object.assign(layout, { artistName: 'The Yezdas', albumPath: path.join(artistDir, layout.albumFolder) });
  };
  const firstTrack = async () => {
    const track = (await fs.readdir(layout.albumPath)).find((f) => f.endsWith('.mp3'))!;
    return readFake(path.join(layout.albumPath, track));
  };

  it('reports a plain artist tag and writes the article last', async () => {
    await moveToTheYezdas();
    await tagAll({ ARTIST: 'The Yezdas', ALBUMARTIST: 'The Yezdas' });
    setArticleSort(SORTED);
    const audit = await scan();
    expect(audit.issues.find((i) => i.code === 'ARTIST_TAG_INVERTED')?.message).toBe(
      'Artist tag "The Yezdas" should be "Yezdas, The" (artist.sortArticles is on)',
    );
    answer([
      [/^ {2}Choice \[1\]/, 's'], // NAME_TAG_MISMATCH on track 6
      [/Brackets:/, ''],
      [/^ {2}Choice \[1\]/, ''],
      [/./, 'q'],
    ]);
    await repairAlbum(audit, ctx());
    expect(output.join('\n')).toMatch(/Write "Yezdas, The" to the artist tags/);
    expect(await firstTrack()).toMatchObject({ ARTIST: 'Yezdas, The', ALBUMARTIST: 'Yezdas, The' });
  });

  it('tags from Discogs with the article last; folder and info.txt keep it first', async () => {
    await moveToTheYezdas();
    await tagAll({ ARTIST: 'Yezdas, The', ALBUMARTIST: 'Yezdas, The' });
    setArticleSort(SORTED);
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce({ ...RELEASE, year: '1976', artists: ['The Yezdas'] });
    const audit = await scan();
    expect(audit.issues.map((i) => i.code)).not.toContain('ARTIST_TAG_INVERTED');
    answer([
      [/^ {2}Choice \[1\]/, 'd'],
      [/Release ID/, '1'],
      [/Apply renames\?/, 'n'],
      [/./, 'q'],
    ]);
    await repairAlbum(audit, ctx());
    // Folder, Discogs and tags agree once the tags' article is put back first.
    expect(output.join('\n')).not.toMatch(/Artist names differ/);
    expect(await firstTrack()).toMatchObject({ ARTIST: 'Yezdas, The', ALBUMARTIST: 'Yezdas, The' });
    const info = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8');
    expect(info.split('\n')[0]).toBe('The Yezdas - Sacred Baboon (1976)');
  });
});

describe('repairAlbum — the artist folder’s brackets in the tags', () => {
  it('go to the tags too, and tags that have them already need no question', async () => {
    const artistDir = path.join(root, 'Y', 'Yezda Urfa [US]');
    await fs.rename(path.dirname(layout.albumPath), artistDir);
    Object.assign(layout, { artistName: 'Yezda Urfa [US]', albumPath: path.join(artistDir, layout.albumFolder) });
    await tagAll({ ARTIST: 'Yezda Urfa [US]', ALBUMARTIST: 'Yezda Urfa [US]' });
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce({ ...RELEASE, year: '1976', artists: ['Yezda Urfa'] });
    const audit = await scan();
    answer([
      [/^ {2}Choice \[1\]/, 'd'],
      [/Release ID/, '1'],
      [/Apply renames\?/, 'n'],
      [/./, 'q'],
    ]);
    await repairAlbum(audit, ctx());
    expect(output.join('\n')).not.toMatch(/Artist names differ/);
    const track = (await fs.readdir(layout.albumPath)).find((f) => f.endsWith('.mp3'))!;
    expect(await readFake(path.join(layout.albumPath, track))).toMatchObject({ ALBUMARTIST: 'Yezda Urfa [US]' });
    const info = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8');
    expect(info.split('\n')[0]).toBe('Yezda Urfa [US] - Sacred Baboon (1976)');
  });
});

describe('repairAlbum — artist folder vs the artist tags', () => {
  const tagsOf = async (name: string) => readFake(path.join(layout.albumPath, name));
  const firstThenArtist = (choice: string): Array<[RegExp, string]> => [
    [/^ {2}Choice \[1\]/, 's'], // NAME_TAG_MISMATCH on track 6
    [/Brackets:/, ''],
    [/^ {2}Choice \[1\]/, choice],
    [/Next album/, ''],
  ];

  it('ARTIST_TAG_INVERTED writes the folder’s name', async () => {
    await tagAll({ ARTIST: 'Urfa, Yezda', ALBUMARTIST: 'Urfa, Yezda' });
    const audit = await scan();
    expect(audit.issues.map((i) => i.code)).toContain('ARTIST_TAG_INVERTED');
    const done = answer(firstThenArtist(''));
    await repairAlbum(audit, ctx());
    done();
    expect(await tagsOf('02 - Cancer Of The Band.mp3')).toMatchObject({
      ARTIST: 'Yezda Urfa',
      ALBUMARTIST: 'Yezda Urfa',
    });
    expect(await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8')).toMatch(
      /artist tags were changed from "Urfa, Yezda" to "Yezda Urfa"/,
    );
  });

  it('ARTIST_FOLDER_MISMATCH [1] writes the folder’s name; a guest keeps its ARTIST', async () => {
    await tagAll({ ARTIST: 'Phil Miller', ALBUMARTIST: 'Phil Miller' });
    const guest = path.join(layout.albumPath, '02 - Cancer Of The Band.mp3');
    await fs.writeFile(guest, JSON.stringify({ ...(await readFake(guest)), ARTIST: 'Phil Miller & Guest' }));
    const audit = await scan();
    const done = answer(firstThenArtist('1'));
    await repairAlbum(audit, ctx());
    done();
    expect(output.join('\n')).toMatch(
      /Artist folder "Yezda Urfa" differs from the album artist in the tags: "Phil Miller"/,
    );
    expect(await tagsOf('03 - To-Ta In The Moya.mp3')).toMatchObject({
      ARTIST: 'Yezda Urfa',
      ALBUMARTIST: 'Yezda Urfa',
    });
    expect(await tagsOf('02 - Cancer Of The Band.mp3')).toMatchObject({
      ARTIST: 'Phil Miller & Guest',
      ALBUMARTIST: 'Yezda Urfa',
    });
  });

  it('ARTIST_FOLDER_MISMATCH [2] moves the album to the tags’ artist, under its letter', async () => {
    await tagAll({ ARTIST: 'Tonbruket', ALBUMARTIST: 'Tonbruket' });
    const audit = await scan();
    const done = answer(firstThenArtist('2'));
    await repairAlbum(audit, ctx());
    done();
    expect(output.join('\n')).toMatch(/\[2\] Move the album to artist folder "T\/Tonbruket" \(the tags' name\)/);
    expect(layout.albumPath).toBe(path.join(root, 'T', 'Tonbruket', '1976 Sacred Baboon'));
  });

  it('is not shown while an artist folder rename from Discogs waits', async () => {
    await tagAll({ ARTIST: 'Yezda Urfa', ALBUMARTIST: 'Yezda Urfa' });
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce({ ...RELEASE, year: '1976', artists: ['Yezda Urfa And Friends'] });
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 'd'],
      [/Release ID/, '1'],
      [/^ {2}Artist \[Enter\/k\]: $/, ''],
      [/Apply renames\?/, 'y'],
      [/Next album/, ''],
    ]);
    await repairAlbum(audit, ctx());
    done();
    expect(output.join('\n')).not.toMatch(/Artist folder "Yezda Urfa" differs/);
  });
});
