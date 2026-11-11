import fs from 'node:fs/promises';
import path from 'node:path';

import { albumBaseOfFolder, discOfFolder } from './disc-split.js';
import { readTags } from './tags.js';
import type { AlbumLayout } from './types.js';

// The other "(Disc k∕m)" folders of the same album, next to this one.

export interface SiblingDisc {
  disc: number;
  albumPath: string;
  trackCount: number;
  releaseId?: string; // the release that folder was tagged from (info.txt, else tags)
}

const isMusic = (name: string) => /\.(flac|mp3)$/i.test(name);

async function releaseIdOf(albumPath: string, files: string[]): Promise<string | undefined> {
  const info = await fs.readFile(path.join(albumPath, 'info.txt'), 'utf8').catch(() => '');
  const fromInfo = info.match(/^Discogs-Release:\s*(\d+)\s*$/m)?.[1];
  if (fromInfo) return fromInfo;
  const first = files[0];
  if (!first) return undefined;
  const ext = path.extname(first).slice(1).toLowerCase() as 'flac' | 'mp3';
  return (await readTags(path.join(albumPath, first), ext)).tags.discogsReleaseId?.trim() || undefined;
}

export async function siblingDiscs(layout: AlbumLayout): Promise<SiblingDisc[]> {
  const own = discOfFolder(layout.albumFolder);
  if (own.noOfDiscs <= 1) return [];
  const base = albumBaseOfFolder(layout.albumFolder);
  const parent = path.dirname(layout.albumPath);
  const entries = await fs.readdir(parent, { withFileTypes: true }).catch(() => []);

  const siblings = await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name !== layout.albumFolder)
      .map(async (e) => {
        const d = discOfFolder(e.name);
        if (d.noOfDiscs !== own.noOfDiscs || d.disc === own.disc || albumBaseOfFolder(e.name) !== base) return [];
        const albumPath = path.join(parent, e.name);
        const files = (await fs.readdir(albumPath).catch(() => [] as string[])).filter(isMusic).sort();
        return [{ disc: d.disc, albumPath, trackCount: files.length, releaseId: await releaseIdOf(albumPath, files) }];
      }),
  );
  return siblings.flat().sort((a, b) => a.disc - b.disc);
}

// Where this disc starts in a release that lists all discs as one run: after the tracks
// of discs 1..n-1. Undefined when one of those folders is missing.
export function expectedFirstTrack(disc: number, siblings: SiblingDisc[]): number | undefined {
  let first = 0;
  for (let k = 1; k < disc; k++) {
    const s = siblings.find((x) => x.disc === k);
    if (!s) return undefined;
    first += s.trackCount;
  }
  return first;
}

// The release the other disc folders were tagged from, when they agree.
export function siblingReleaseId(siblings: SiblingDisc[]): string | undefined {
  const ids = new Set(siblings.flatMap((s) => (s.releaseId ? [s.releaseId] : [])));
  return ids.size === 1 ? [...ids][0] : undefined;
}
