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
const { repairAlbum, resetRepairSession, setPrompt } = await import('./repair.js');
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
      [/Old year \[Enter\/l\/r\/c\]/, ''], // no bracket
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
    expect(first).toMatchObject({ TITLE: 'Your Move', TRACKNUMBER: '1/7', DISCNUMBER: '2/2', DISCOGS_RELEASE_ID: '8270054' });
    const last = await readFake(path.join(disc2.albumPath, '07 - Starship Trooper.mp3'));
    expect(last).toMatchObject({ TITLE: 'Starship Trooper', TRACKNUMBER: '7/7', DISCNUMBER: '2/2' });
    expect(await fs.readFile(path.join(disc2.albumPath, 'info.txt'), 'utf8')).toMatch(/Disc: 2\/2/);
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
      [/Release ID \[8270054\]/, ''],
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
      [/Release ID/, ''],
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
      [/Next album/, ''],
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
  'Opening_-_Siberian_Khatru', 'Heart_Of_The_Sunrise', 'Future_Times_-_Rejoice', 'Circus_Of_Heaven',
  'Time_And_A_Word', 'Long_Distance_Runaround', 'The_Fish', 'Perpetual_Change', 'Soon', "Don't_Kill_The_Whale",
  'Madrigal_-_Clap', 'Starship_Trooper', 'Rick_Wakeman_Solo', 'Awaken', "I've_Seen_All_Good_People", 'Roundabout',
  'Madrigal', 'On_The_Silent_Wings_Of_Freedom', 'And_You_And_I',
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
      [/Next album/, ''],
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
  'The Frim-Fram Sauce', 'Song Two', 'April Showers', 'Song Four', 'Song Five', 'Song Six', 'Song Seven',
  'Song Eight', 'Song Nine', 'Song Ten', 'Song Eleven', 'Song Twelve', 'Song Thirteen', 'Song Fourteen',
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
      [/^ {2}Choice \[1\]/, 's'], // DUPLICATE_TRACKS ×2, still there after the re-scan
      [/^ {2}Choice \[1\]/, 's'],
      [/\[r\] Retry/, ''],
      [/Next album/, ''],
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
    expect(await readFake(path.join(artDeco.albumPath, '03 - April Showers.mp3'))).toMatchObject({ TRACKNUMBER: '3/15' });
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
    issues: [{ severity: 'HIGH', code: 'YEAR_NOT_ORIGINAL', message: 'Year 1979 is not the original release year 1992' }],
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
    expect(await readFake(path.join(disc1.albumPath, '01 - Song.mp3'))).toMatchObject({ DATE: '1992', ORIGINALDATE: '1992' });
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
