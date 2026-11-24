import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';

import { sortArtist, unsortArtist } from '../articles.js';
import { albumArtistOf, commonAlbumArtist, expectedArtistTag } from '../checks/artist.js';
import { releaseIdFrom, tracksMissingReleaseId } from '../checks/discogs-ids.js';
import { expectedLetter } from '../checks/folder.js';
import { localNumbering } from '../checks/names.js';
import { folderYear, withFolderYear } from '../checks/year.js';
import { artistCoverCandidates, artistDirOf, asJpeg, writeCover } from '../cover.js';
import { discNumbers, sanitizeFilename, sanitizeTitle } from '../rename-plan.js';
import { writeTags } from '../tag-write.js';
import { type AlbumAudit, type Issue } from '../types.js';
import { applyOldYear } from '../year-bracket.js';
import { coverActions } from './covers.js';
import { discogsActionFor, type RepairAction } from './discogs-action.js';
import {
  albumMetaFromLayout,
  askOldYearBracket,
  moveToArtist,
  musicFilesIn,
  noteChange,
  renameAlbumFolder,
} from './folder.js';
import { ask } from './prompt.js';

// The repair actions offered for each issue code: one handler per code, none for a code
// without an automated repair.

type ActionsFor = (issue: Issue, audit: AlbumAudit, token?: string) => Promise<RepairAction[]>;

const renameTo = (audit: AlbumAudit, newName: string): RepairAction => ({
  label: `Rename folder → "${newName}"`,
  run: () => renameAlbumFolder(audit.layout, newName),
});

// ── SEVERE: rename folder ──────────────────────────────────────────────────

const missingYearPrefix: ActionsFor = async (_issue, audit) => {
  const { layout } = audit;
  // Prefer year embedded in folder name, fall back to best Discogs result
  const yearFromFolder = layout.albumFolder.match(/\b(19|20)\d{2}\b/)?.[0];
  const yearFromDiscogs = audit.discogsResults?.[0]?.originalYear ?? audit.discogsResults?.[0]?.year;
  const guessedYear = yearFromFolder ?? yearFromDiscogs;

  const yearActions: RepairAction[] = [];

  if (guessedYear) yearActions.push(renameTo(audit, `${guessedYear} ${layout.albumFolder}`));

  yearActions.push({
    label: `Enter release year manually and rename${guessedYear ? ` (default: ${guessedYear})` : ''}`,
    run: async () => {
      const input = (await ask(`    Year [${guessedYear ?? 'YYYY'}]: `)).trim();
      const year = input || guessedYear;
      if (!year?.match(/^\d{4}$/)) {
        console.log(chalk.yellow('  Skipped — invalid year'));
        return;
      }
      await renameAlbumFolder(layout, `${year} ${layout.albumFolder}`);
    },
  });

  return yearActions;
};

const wrongDiscSeparator: ActionsFor = async (issue, audit) => {
  const newNameMatch = issue.suggestion?.match(/Rename(?: to)?[: ]+"(.+)"/);
  return newNameMatch ? [renameTo(audit, newNameMatch[1])] : [];
};

// Computes the rename directly — the suggestion string is human-readable and not parseable.
const wrongAuxBrackets: ActionsFor = async (_issue, audit) => [
  renameTo(audit, audit.layout.albumFolder.replace(/\{([^}]+)\}/g, '[$1]')),
];

// ── SEVERE: move artist to correct letter dir ──────────────────────────────

const wrongLetterDir: ActionsFor = async (_issue, { layout }) => {
  const expected = layout.artistName
    .replace(/^(the|a|an|los|il|la|el|le)\s+/i, '')
    .charAt(0)
    .toUpperCase();
  // Only this album moves, like a Discogs artist change: the artist's other albums are in
  // the scan queue under the old path, and each moves when its own turn comes. An artist
  // folder under the right letter is joined; the old one goes with its last album.
  const root = path.dirname(path.dirname(path.dirname(layout.albumPath))); // above the letter folder
  const letterDir = path.join(root, expected);
  const joins = (await fs.readdir(letterDir).catch(() => [] as string[])).find(
    (n) => n.toLowerCase() === layout.artistName.toLowerCase(),
  );
  const target = `${expected}/${joins ?? layout.artistName}`;
  return [
    {
      label: `Move "${layout.albumFolder}" to ${target}${joins ? ' (joins the folder there)' : ''}`,
      run: () => moveToArtist(layout, layout.artistName, expected),
    },
  ];
};

// ── HIGH: no / missing tags → tag from folder or Discogs ──────────────────

const missingTags: ActionsFor = async (_issue, audit, token) => {
  const { layout } = audit;
  const meta = albumMetaFromLayout(layout);
  const files = await musicFilesIn(layout.albumPath);
  const total = files.length;

  const actions: RepairAction[] = [];

  if (token) actions.push(await discogsActionFor(audit, token));

  // Folder tagging as fallback — no title, but fills artist/album/year/track
  actions.push({
    label: `Tag from folder (${meta.artist} — ${meta.year ?? '?'} ${meta.album}) — title will be empty`,
    run: async () => {
      const local = localNumbering(
        files.map((f) => f.name),
        parseInt(meta.discNumber, 10),
      );
      const discs = discNumbers(
        local.map((l) => l.disc),
        { disc: parseInt(meta.discNumber, 10), of: parseInt(meta.noOfDiscs, 10) },
      );
      for (const [i, { name, ext }] of files.entries()) {
        const { no } = local[i];
        const tags: Record<string, string> = {
          ARTIST: sortArtist(meta.artist),
          ALBUMARTIST: sortArtist(meta.artist),
          ALBUM: meta.album,
          TRACKNUMBER: `${no}/${total}`,
          DISCNUMBER: discs[i],
          ...(meta.year ? { DATE: meta.year } : {}),
        };
        await writeTags(path.join(layout.albumPath, name), ext, tags);
        console.log(chalk.green(`  ✓ Tagged ${name}`));
      }
    },
  });

  return actions;
};

// ── HIGH: reissue year instead of the original (master) year ───────────────

const yearNotOriginal: ActionsFor = async (_issue, audit) => {
  const { layout } = audit;
  const year = audit.originalYear?.year;
  if (!year) return [];
  const files = await musicFilesIn(layout.albumPath);
  const retag = async () => {
    for (const { name, ext } of files) {
      await writeTags(path.join(layout.albumPath, name), ext, { DATE: year, ORIGINALDATE: year });
      console.log(chalk.green(`  ✓ ${name} → ${year}`));
    }
  };
  const local = folderYear(layout.albumFolder);
  if (!local || local === year) return [{ label: `Set DATE/ORIGINALDATE to ${year}`, run: retag }];
  const newName = withFolderYear(layout.albumFolder, year);
  return [
    {
      label: `Set DATE/ORIGINALDATE to ${year} and rename folder → "${newName}"`,
      run: async () => {
        const oldYear = await askOldYearBracket(layout, local, year);
        await retag();
        await renameAlbumFolder(layout, applyOldYear(newName, oldYear));
        return `Set DATE/ORIGINALDATE to ${year} and rename folder → "${layout.albumFolder}"`;
      },
    },
    { label: `Set DATE/ORIGINALDATE to ${year} (keep folder name)`, run: retag },
  ];
};

// ── MODERATE: filename/tag mismatch ────────────────────────────────────────

const nameTagMismatch: ActionsFor = async (issue, audit) => {
  if (!issue.file) return [];
  const track = audit.tracks.find((t) => t.fileName === issue.file);
  if (!track) return [];

  const actions: RepairAction[] = [];

  // Option A: rename file to match tag
  if (track.tags.title) {
    const { no, disc } = localNumbering(audit.tracks.map((t) => t.fileName))[audit.tracks.indexOf(track)];
    const isMultiDisc = /^d\d+t\d+/i.test(track.fileName);
    const ext = path.extname(track.fileName);
    const artistPrefix = track.tags.artist ? ` ${sanitizeFilename(track.tags.artist)} - ` : ' ';
    const safeTitle = sanitizeTitle(track.tags.title);
    const newName = isMultiDisc
      ? `d${disc}t${String(no).padStart(2, '0')}.${artistPrefix}${safeTitle}${ext}`
      : `${String(no).padStart(2, '0')} -${artistPrefix}${safeTitle}${ext}`;
    const oldPath = track.filePath;
    const newPath = path.join(path.dirname(oldPath), newName);
    actions.push({
      label: `Rename file to match tag → "${newName}"`,
      run: async () => {
        await fs.rename(oldPath, newPath);
        track.filePath = newPath;
        track.fileName = newName;
        console.log(chalk.green(`  ✓ Renamed to ${newName}`));
      },
    });
  }

  // Option B: update tag to match filename
  if (track.parsedName) {
    const title = track.parsedName;
    actions.push({
      label: `Update TITLE tag → "${title}"`,
      run: async () => {
        await writeTags(track.filePath, track.ext, { TITLE: title });
        track.tags.title = title;
        console.log(chalk.green(`  ✓ Updated TITLE tag to "${title}"`));
      },
    });
  }

  return actions;
};

// ── HIGH: mp3s that lost DISCOGS_RELEASE_ID (id3v2 kept only one TXXX frame) ──

const missingReleaseId: ActionsFor = async (_issue, audit, token) => {
  const affected = tracksMissingReleaseId(audit.tracks);
  const infoTxt = await fs.readFile(path.join(audit.layout.albumPath, 'info.txt'), 'utf8').catch(() => undefined);
  const found = releaseIdFrom(audit.tracks, infoTxt);
  const actions: RepairAction[] = [];
  if (found) {
    const url = `https://www.discogs.com/release/${found.id}`;
    actions.push({
      label: `Write release ID ${found.id} (from ${found.source}) and the Discogs URL comment to ${affected.length} track(s)`,
      run: async () => {
        for (const t of affected) {
          await writeTags(t.filePath, t.ext, { DISCOGS_RELEASE_ID: found.id, COMMENT: url });
          console.log(chalk.green(`  ✓ ${t.fileName}`));
        }
      },
    });
  }
  // Retag the whole album from a release of your choice (the found ID, or another).
  if (token) actions.push(await discogsActionFor(audit, token, found));
  return actions;
};

// ── MODERATE: artist folder vs the artist tags ────────────────────────────

const artistMismatch: ActionsFor = async (issue, audit) => {
  const { layout } = audit;
  // The folder's name, or "Beatles, The" for "The Beatles" with artist.sortArticles on.
  const folder = expectedArtistTag(layout.artistName);
  const tagged = commonAlbumArtist(audit.tracks);
  const actions: RepairAction[] = [
    {
      label: `Write "${folder}" to the artist tags (ALBUMARTIST; ARTIST where it is empty or the same)`,
      run: async () => {
        for (const t of audit.tracks) {
          const old = albumArtistOf(t);
          const artist = t.tags.artist?.trim();
          // A guest or featured artist on one track keeps its ARTIST.
          const sameArtist = !artist || artist === old || artist === tagged;
          await writeTags(t.filePath, t.ext, { ALBUMARTIST: folder, ...(sameArtist ? { ARTIST: folder } : {}) });
          console.log(chalk.green(`  ✓ ${t.fileName}`));
        }
        await noteChange(layout, `artist tags were changed from "${tagged}" to "${folder}"`);
      },
    },
  ];
  if (issue.code === 'ARTIST_FOLDER_MISMATCH' && tagged) {
    // "/" can't be in a folder name: "A / B" → "A - B", as the Discogs rename makes it (the
    // check takes that folder for the tag). Folders keep the article first ("Beatles, The"
    // tags → "The Beatles").
    const target = sanitizeFilename(unsortArtist(tagged));
    const letterDir = layout.letterDir ?? '';
    const letter = /^[A-Z0-9]$/i.test(letterDir) ? expectedLetter(target) : undefined;
    const otherLetter = letter && letter !== letterDir.toUpperCase() ? letter : undefined;
    // First, so Enter takes it: the tags hold the name chosen when they were written.
    actions.unshift({
      label: `Move the album to artist folder "${otherLetter ? `${otherLetter}/` : ''}${target}" (the tags' name)`,
      run: () => moveToArtist(layout, target, otherLetter),
    });
  }
  return actions;
};

// ── MODERATE: duplicates — manual only ────────────────────────────────────

const duplicateTracks: ActionsFor = async (_issue, { layout, tracks }) => [
  {
    label: `Open album folder for manual review (no auto-fix for duplicates)`,
    run: async () => {
      console.log(chalk.dim(`  Folder: ${layout.albumPath}`));
      console.log(chalk.dim(`  Files:  ${tracks.map((t) => t.fileName).join(', ')}`));
    },
  },
];

// ── MODERATE: covers ──────────────────────────────────────────────────────

const artistCoverMissing: ActionsFor = async (_issue, { layout }) => {
  const artistDir = artistDirOf(layout);
  return (await artistCoverCandidates(layout)).map((file) => {
    const from = path.basename(path.dirname(file));
    return {
      label: `Copy ${path.basename(file)} from "${from}" to the artist folder "${path.basename(artistDir)}"`,
      run: async () => {
        const written = await writeCover(artistDir, await asJpeg(file));
        console.log(chalk.green(`  ✓ ${path.basename(artistDir)}/${written.join(', ')} (from "${from}")`));
      },
    };
  });
};

const handlers: Record<string, ActionsFor> = {
  MISSING_YEAR_PREFIX: missingYearPrefix,
  WRONG_DISC_SEPARATOR: wrongDiscSeparator,
  WRONG_AUX_BRACKETS: wrongAuxBrackets,
  WRONG_LETTER_DIR: wrongLetterDir,
  NO_TAGS: missingTags,
  MISSING_TAGS: missingTags,
  YEAR_NOT_ORIGINAL: yearNotOriginal,
  NAME_TAG_MISMATCH: nameTagMismatch,
  MISSING_RELEASE_ID: missingReleaseId,
  ARTIST_TAG_INVERTED: artistMismatch,
  ARTIST_FOLDER_MISMATCH: artistMismatch,
  DUPLICATE_TRACKS: duplicateTracks,
  MISSING_COVER: coverActions,
  BAD_COVER: coverActions,
  COVER_MISMATCH: coverActions,
  ARTIST_COVER_MISSING: artistCoverMissing,
};

export async function repairActions(issue: Issue, audit: AlbumAudit, token?: string): Promise<RepairAction[]> {
  return Object.hasOwn(handlers, issue.code) ? handlers[issue.code](issue, audit, token) : [];
}
