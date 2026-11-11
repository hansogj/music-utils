import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

const { auditAlbum } = await import('./audit-album.js');
const { repairAlbum, setPrompt } = await import('./repair.js');
type RepairEvent = import('./repair.js').RepairEvent;

let root: string;
let layout: AlbumLayout;
let events: Array<Omit<RepairEvent, 'ts' | 'session'>>;
let output: string[];
let asked: string[];

// Answers prompts in order; fails on a prompt the test didn't expect.
function answer(script: Array<[RegExp, string]>) {
  const queue = [...script];
  setPrompt(async (q) => {
    asked.push(q);
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
    const newPath = path.join(root, 'Y', 'Yezda Urfa', '1989 Sacred Baboon');
    expect(layout.albumPath).toBe(newPath);
    expect(layout.albumFolder).toBe('1989 Sacred Baboon');
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
  });

  it('a skipped issue is not asked again in the same pass', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, 's'], // MISSING_TAGS
      [/^ {2}Choice \[1\]/, 's'], // NAME_TAG_MISMATCH
      [/\[r\] Retry/, ''], // 2 issues not fixed → continue
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/2 issue\(s\) not fixed/);
    expect(events.map((e) => e.result)).toEqual(['skipped', 'skipped']);
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

  it('o at the release ID prompt goes back to the album\'s opening table', async () => {
    const audit = await scan();
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → [1] Tag from Discogs
      [/Release ID/, 'o'], // regret
      [/^ {2}Choice \[1\]/, 's'], // MISSING_TAGS again, from the top
      [/^ {2}Choice \[1\]/, 's'], // NAME_TAG_MISMATCH
      [/\[r\] Retry/, ''],
      [/Next album/, ''],
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
      { id: 4376665, title: 'Yezda Urfa - Sacred Baboon', year: '1989', releaseUrl: 'https://www.discogs.com/release/4376665' },
    ];
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // MISSING_TAGS → Discogs
      [/Release ID \[4376665\]/, ''],
      [/Apply renames\?/, 'n'], // so track 1's file name disagrees with its new title
      [/Rename folder\(s\) to match Discogs\?/, 'y'], // 1976 → 1989, pending
      [/^ {2}Choice \[1\]/, 'o'], // at the track 1 mismatch: regret
      [/^ {2}Choice \[1\]/, 's'], // the mismatch, shown from the top again
      [/\[r\] Retry/, ''],
      [/Next album/, ''],
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
      ['NAME_TAG_MISMATCH', 'Tag from Discogs release ID', 'fixed'],
    ]);
    const track1 = await readFake(path.join(layout.albumPath, "01 - Give 'Em Some Rawhide Chewies.mp3"));
    expect(track1).toMatchObject({ DISCOGS_RELEASE_ID: '1886376', DISCOGS_MASTER_ID: '123456' });
  });

  it('suggests the release the album is already tagged with', async () => {
    await tagAll({ DISCOGS_RELEASE_ID: '1886376' });
    const audit = await scan();
    audit.discogsResults = [
      { id: 10152054, title: 'Yezda Urfa - Sacred Baboon', year: '1991', releaseUrl: 'https://www.discogs.com/release/10152054' },
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
      await fs.writeFile(path.join(disc2Path, `${String(i + 1).padStart(2, '0')} - ${title}.mp3`), JSON.stringify({ TITLE: title }));
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
      [/Release ID \[8270054\]/, ''],
      [/\[Enter\] OK {3}\[n\] Start at another track/, ''],
      [/Apply renames\?/, 'n'],
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
    done();
    const out = output.join('\n');
    expect(out).toMatch(/suggested: 8270054, from the other disc folder/);
    expect(out).toMatch(/Disc 2∕2 → release tracks 9–15 of 15 \(D1 Your Move … Starship Trooper\), \d+% title match/);
    expect(out).not.toMatch(/more track\(s\)/); // compared with disc 2's 7 tracks, not all 15
    const first = await readFake(path.join(disc2.albumPath, '01 - Your Move.mp3'));
    expect(first).toMatchObject({ TITLE: 'Your Move', TRACKNUMBER: '1/7', DISCNUMBER: '2/2', DISCOGS_RELEASE_ID: '8270054' });
    const last = await readFake(path.join(disc2.albumPath, '07 - Starship Trooper.mp3'));
    expect(last).toMatchObject({ TITLE: 'Starship Trooper', TRACKNUMBER: '7/7', DISCNUMBER: '2/2' });
    expect(await fs.readFile(path.join(disc2.albumPath, 'info.txt'), 'utf8')).toMatch(/Disc: 2\/2/);
  });

  it('[n] moves the disc to another start track', async () => {
    const { fetchRelease } = await import('./discogs.js');
    vi.mocked(fetchRelease).mockResolvedValueOnce(YESSONGS_RELEASE);
    const audit = await auditAlbum(disc2, { skipDiscogs: true });
    const done = answer([
      [/^ {2}Choice \[1\]/, ''],
      [/Release ID/, ''],
      [/\[n\] Start at another track/, 'n'],
      [/Disc 2∕2 starts at release track \(1–15\)/, '20'], // out of range → ask again
      [/\[n\] Start at another track/, 'n'],
      [/Disc 2∕2 starts at release track/, '9'],
      [/\[n\] Start at another track/, ''],
      [/Apply renames\?/, 'n'],
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
      [/Next album/, ''],
    ]);
    expect(await repairAlbum(audit, disc2Ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/neither the titles nor the other disc folders tell where Disc 2∕2 starts/);
    expect(await readFake(path.join(disc2.albumPath, '01 - Your Move.mp3'))).toEqual({});
  });
});
