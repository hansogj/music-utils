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
    const done = answer([
      [/^ {2}Choice \[1\]/, ''], // [1] Write release ID 4376665 (from info.txt)
      [/Next album/, ''],
    ]);

    expect(await repairAlbum(audit, ctx())).toBe('next');
    done();
    expect(output.join('\n')).toMatch(/Write release ID 4376665 \(from info\.txt\)/);
    expect(audit.issues).toEqual([]);
    const track1 = await readFake(path.join(layout.albumPath, "01 - Give'em Some Rawhide Chewies.mp3"));
    expect(track1).toMatchObject({
      DISCOGS_RELEASE_ID: '4376665',
      DISCOGS_MASTER_ID: '245487',
      COMMENT: 'https://www.discogs.com/release/4376665',
    });
  });
});
