import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';

import { albumRef, asJpeg, COVER, coversIn, isImage, matchesDiscogs, readableImagesIn, writeCover } from '../cover.js';
import {
  discogsCoverSource,
  type DiscogsRef,
  downloadImage,
  fetchMasterCover,
  fetchReleaseCover,
  parseDiscogsRef,
} from '../discogs.js';
import { interactive } from '../rate-limit.js';
import { type AlbumAudit, type AlbumLayout, type Issue } from '../types.js';
import { type RepairAction } from './discogs-action.js';
import { noteChange } from './folder.js';
import { ask } from './prompt.js';

// Cover repair actions: Discogs cover, the folder's other cover file, another image.

const refName = (ref: DiscogsRef) => `${ref.type} ${ref.type === 'master' ? 'm' : 'r'}${ref.id}`;

// Downloads the Discogs cover (the release's front image, else its master's) into the album
// folder: as `target` (the cover file the issue is about, folder.jpg keeps its name), else cover.jpg.
async function downloadCover(layout: AlbumLayout, ref: DiscogsRef, token: string, target?: string): Promise<string> {
  const image = await interactive(async () =>
    ref.type === 'master' ? fetchMasterCover(Number(ref.id), token) : (await fetchReleaseCover(ref.id, token)).cover,
  );
  if (!image) throw new Error(`Discogs ${refName(ref)} has no images`);
  const name = target ?? COVER;
  await writeCover(layout.albumPath, await downloadImage(image.uri), [name]);
  console.log(chalk.green(`  ✓ ${name} from Discogs ${refName(ref)}`));
  await noteChange(layout, `${name} was ${target ? 'replaced with' : 'set to'} the cover of Discogs ${refName(ref)}`);
  return `${name} from Discogs ${refName(ref)}`;
}

export async function coverActions(issue: Issue, audit: AlbumAudit, token?: string): Promise<RepairAction[]> {
  const { layout } = audit;
  const infoTxt = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8').catch(() => undefined);
  const ref = albumRef(audit.tracks, infoTxt);
  const target = issue.file; // the cover.jpg / folder.jpg the issue is about; none when missing
  const name = target ?? COVER;
  const actions: RepairAction[] = [];
  if (token && ref.releaseId) {
    const r: DiscogsRef = { type: 'release', id: ref.releaseId };
    actions.push({
      label: `Download the cover of Discogs ${refName(r)} as ${name}`,
      run: () => downloadCover(layout, r, token, target),
    });
  }
  if (token && ref.masterId) {
    const m: DiscogsRef = { type: 'master', id: String(ref.masterId) };
    actions.push({
      label: `Download the cover of Discogs ${refName(m)} as ${name}`,
      run: () => downloadCover(layout, m, token, target),
    });
  }
  if (issue.code === 'BAD_COVER' && target) {
    // The folder's other cover file, when that one is a good image.
    for (const other of (await coversIn(layout.albumPath)).filter((c) => c !== target)) {
      const file = path.join(layout.albumPath, other);
      if ((await isImage(file)) === false) continue;
      actions.unshift({
        label: `Replace ${target} with a copy of ${other}`,
        run: async () => {
          await writeCover(layout.albumPath, await fs.readFile(file), [target]);
          console.log(chalk.green(`  ✓ ${target} (from ${other})`));
        },
      });
    }
  }
  if (issue.code !== 'COVER_MISMATCH') {
    // front.jpg and the like: one that is the Discogs cover goes first.
    for (const image of await readableImagesIn(layout.albumPath)) {
      const file = path.join(layout.albumPath, image);
      const isDiscogs = token
        ? await interactive(() => matchesDiscogs(file, ref, discogsCoverSource(token))).catch(() => undefined)
        : undefined;
      const action: RepairAction = {
        label: `Use ${image} as ${name} (a copy)${isDiscogs ? ' — it is the Discogs cover' : ''}`,
        run: async () => {
          await writeCover(layout.albumPath, await asJpeg(file), [name]);
          console.log(chalk.green(`  ✓ ${name} (from ${image})`));
        },
      };
      if (isDiscogs) actions.unshift(action);
      else actions.push(action);
    }
  }
  if (token) {
    const suggested = ref.releaseId
      ? `r${ref.releaseId}`
      : audit.discogsResults?.[0]
        ? `r${audit.discogsResults[0].id}`
        : undefined;
    actions.push({
      label: 'Download the cover of a Discogs release or master you enter',
      run: async () => {
        const input =
          (await ask(`    Release or master ID${suggested ? ` [${suggested}]` : ''}: `)).trim() || suggested || '';
        const entered = parseDiscogsRef(input);
        if (!entered) {
          console.log(chalk.yellow('  Skipped — not a release or master ID'));
          return 'skipped';
        }
        return downloadCover(layout, entered, token, target);
      },
    });
  }
  return actions;
}
