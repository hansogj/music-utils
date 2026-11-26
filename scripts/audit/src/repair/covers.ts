import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';

import {
  albumRef,
  asJpeg,
  COVER,
  coverAndFolderIn,
  coversIn,
  isImage,
  matchesDiscogs,
  readableImagesIn,
  siblingDiscCovers,
  tidyCoverFiles,
  writeCover,
} from '../cover.js';
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
  // The master's cover first (Enter): the original album's, not one reissue's.
  if (token && ref.masterId) {
    const m: DiscogsRef = { type: 'master', id: String(ref.masterId) };
    actions.push({
      label: `Download the cover of Discogs ${refName(m)} as ${name}`,
      run: () => downloadCover(layout, m, token, target),
    });
  }
  if (token && ref.releaseId) {
    const r: DiscogsRef = { type: 'release', id: ref.releaseId };
    actions.push({
      label: `Download the cover of Discogs ${refName(r)} as ${name}`,
      run: () => downloadCover(layout, r, token, target),
    });
  }
  if (issue.code === 'BAD_COVER' && target) {
    // The folder's other cover file, when that one is a good image: it is the one cover.jpg.
    const { cover } = await coverAndFolderIn(layout.albumPath);
    for (const other of (await coversIn(layout.albumPath)).filter((c) => c !== target)) {
      const file = path.join(layout.albumPath, other);
      if ((await isImage(file)) === false) continue;
      const broken = path.join(layout.albumPath, target);
      actions.unshift(
        other === cover
          ? {
              label: `Remove ${target} (${other} is the cover)`,
              run: async () => {
                await fs.rm(broken);
                console.log(chalk.green(`  ✓ ${target} removed`));
                await noteChange(layout, `${target} removed: not an image`);
              },
            }
          : {
              label: `Remove ${target} and rename ${other} to ${COVER}`,
              run: async () => {
                await fs.rm(broken);
                await fs.rename(file, path.join(layout.albumPath, COVER));
                console.log(chalk.green(`  ✓ ${COVER} (was ${other})`));
                await noteChange(layout, `${target} removed (not an image), ${other} renamed to ${COVER}`);
              },
            },
      );
    }
  }
  if (issue.code === 'MISSING_COVER' || issue.code === 'BAD_COVER') {
    // Another disc folder's cover: first, unless it is known not to be the Discogs cover
    // (one that is was copied unasked before the scan).
    for (const s of await siblingDiscCovers(layout)) {
      const isDiscogs = token
        ? await interactive(() =>
            matchesDiscogs(s.file, ref.releaseId || ref.masterId ? ref : s.ref, discogsCoverSource(token)),
          ).catch(() => undefined)
        : undefined;
      const action: RepairAction = {
        label: `Copy Disc ${s.disc}'s ${path.basename(s.file)} as ${name}${isDiscogs === false ? ' — not the Discogs cover' : ''}`,
        run: async () => {
          await writeCover(layout.albumPath, await asJpeg(s.file), [name]);
          console.log(chalk.green(`  ✓ ${name} (from Disc ${s.disc})`));
          await noteChange(layout, `${name} copied from Disc ${s.disc}`);
          return `${name} from Disc ${s.disc}`;
        },
      };
      if (isDiscogs === false) actions.push(action);
      else actions.unshift(action);
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

// FOLDER_JPG: repair tidies these before the checks; this is for one that is left (the
// rename failed, or the scan ran without it).
export async function folderJpgActions(issue: Issue, { layout }: AlbumAudit): Promise<RepairAction[]> {
  const { cover, folder } = await coverAndFolderIn(layout.albumPath);
  if (!folder) return [];
  return [
    {
      label: cover ? `Remove ${folder} (the same image as ${cover})` : `Rename ${folder} to ${COVER}`,
      run: async () => {
        const changes = await tidyCoverFiles(layout.albumPath);
        if (changes.length === 0) return 'skipped';
        for (const change of changes) {
          console.log(chalk.green(`  ✓ ${change}`));
          await noteChange(layout, change);
        }
        return changes.join('; ');
      },
    },
  ];
}

// COVER_FILES_DIFFER: keep one of the two as cover.jpg; the Discogs cover, when one is, first.
export async function coverFilesDifferActions(
  _issue: Issue,
  audit: AlbumAudit,
  token?: string,
): Promise<RepairAction[]> {
  const { layout } = audit;
  const dir = layout.albumPath;
  const { cover, folder } = await coverAndFolderIn(dir);
  if (!cover || !folder) return [];
  const infoTxt = await fs.readFile(path.join(dir, 'info.txt'), 'utf8').catch(() => undefined);
  const ref = albumRef(audit.tracks, infoTxt);
  const isDiscogs = async (name: string) =>
    token
      ? await interactive(() => matchesDiscogs(path.join(dir, name), ref, discogsCoverSource(token))).catch(
          () => undefined,
        )
      : undefined;
  const [coverIsDiscogs, folderIsDiscogs] = [await isDiscogs(cover), await isDiscogs(folder)];
  const discogs = (yes?: boolean) => (yes ? ' — it is the Discogs cover' : '');
  const keepCover: RepairAction = {
    label: `Keep ${cover}, remove ${folder}${discogs(coverIsDiscogs)}`,
    run: async () => {
      await fs.rm(path.join(dir, folder));
      console.log(chalk.green(`  ✓ ${folder} removed`));
      await noteChange(layout, `${folder} removed: ${cover} kept as the cover`);
      return `kept ${cover}`;
    },
  };
  const keepFolder: RepairAction = {
    label: `Keep ${folder} as ${COVER}, remove ${cover}${discogs(folderIsDiscogs)}`,
    run: async () => {
      await fs.rm(path.join(dir, cover));
      await fs.rename(path.join(dir, folder), path.join(dir, COVER));
      console.log(chalk.green(`  ✓ ${COVER} (was ${folder})`));
      await noteChange(layout, `${cover} removed, ${folder} renamed to ${COVER}`);
      return `kept ${folder} as ${COVER}`;
    },
  };
  return folderIsDiscogs && !coverIsDiscogs ? [keepFolder, keepCover] : [keepCover, keepFolder];
}
