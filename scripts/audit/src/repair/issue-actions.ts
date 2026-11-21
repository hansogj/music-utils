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
import { sanitizeFilename } from '../rename-plan.js';
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

// The repair actions offered for each issue code.

export async function repairActions(issue: Issue, audit: AlbumAudit, token?: string): Promise<RepairAction[]> {
  const { layout } = audit;

  switch (issue.code) {
    // ── SEVERE: rename folder ──────────────────────────────────────────────
    case 'MISSING_YEAR_PREFIX': {
      // Prefer year embedded in folder name, fall back to best Discogs result
      const yearFromFolder = layout.albumFolder.match(/\b(19|20)\d{2}\b/)?.[0];
      const yearFromDiscogs = audit.discogsResults?.[0]?.originalYear ?? audit.discogsResults?.[0]?.year;
      const guessedYear = yearFromFolder ?? yearFromDiscogs;

      const yearActions: RepairAction[] = [];

      if (guessedYear) {
        const newName = `${guessedYear} ${layout.albumFolder}`;
        yearActions.push({
          label: `Rename folder → "${newName}"`,
          run: () => renameAlbumFolder(layout, newName),
        });
      }

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
    }

    case 'WRONG_DISC_SEPARATOR': {
      const newNameMatch = issue.suggestion?.match(/Rename(?: to)?[: ]+"(.+)"/);
      if (!newNameMatch) return [];
      const newName = newNameMatch[1];
      return [{ label: `Rename folder → "${newName}"`, run: () => renameAlbumFolder(layout, newName) }];
    }

    case 'WRONG_AUX_BRACKETS': {
      // Compute the rename directly — the suggestion string is human-readable and not parseable.
      const newName = layout.albumFolder.replace(/\{([^}]+)\}/g, '[$1]');
      return [{ label: `Rename folder → "${newName}"`, run: () => renameAlbumFolder(layout, newName) }];
    }

    // ── SEVERE: move artist to correct letter dir ──────────────────────────
    case 'WRONG_LETTER_DIR': {
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
    }

    // ── HIGH: no / missing tags → tag from folder or Discogs ──────────────
    case 'NO_TAGS':
    case 'MISSING_TAGS': {
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
          for (const [i, { name, ext }] of files.entries()) {
            const { no, disc } = local[i];
            const tags: Record<string, string> = {
              ARTIST: sortArtist(meta.artist),
              ALBUMARTIST: sortArtist(meta.artist),
              ALBUM: meta.album,
              TRACKNUMBER: `${no}/${total}`,
              DISCNUMBER: `${disc}/${meta.noOfDiscs}`,
              ...(meta.year ? { DATE: meta.year } : {}),
            };
            await writeTags(path.join(layout.albumPath, name), ext, tags);
            console.log(chalk.green(`  ✓ Tagged ${name}`));
          }
        },
      });

      return actions;
    }

    // ── HIGH: reissue year instead of the original (master) year ───────────
    case 'YEAR_NOT_ORIGINAL': {
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
    }

    // ── MODERATE: filename/tag mismatch ────────────────────────────────────
    case 'NAME_TAG_MISMATCH': {
      if (!issue.file) return [];
      const track = audit.tracks.find((t) => t.fileName === issue.file);
      if (!track) return [];

      const actions: RepairAction[] = [];

      // Option A: rename file to match tag
      if (track.tags.title) {
        const { no, disc } = localNumbering(audit.tracks.map((t) => t.fileName))[audit.tracks.indexOf(track)];
        const isMultiDisc = /^d\d+t\d+/i.test(track.fileName);
        const ext = path.extname(track.fileName);
        const artistPrefix = track.tags.artist ? ` ${track.tags.artist} - ` : ' ';
        const safeTitle = sanitizeFilename(track.tags.title);
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
    }

    // ── HIGH: mp3s that lost DISCOGS_RELEASE_ID (id3v2 kept only one TXXX frame) ──
    case 'MISSING_RELEASE_ID': {
      const affected = tracksMissingReleaseId(audit.tracks);
      const infoTxt = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8').catch(() => undefined);
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
    }

    // ── MODERATE: artist folder vs the artist tags ────────────────────────
    case 'ARTIST_TAG_INVERTED':
    case 'ARTIST_FOLDER_MISMATCH': {
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
        // "/" can't be in a folder name: "A / B" → "A, B", as a joined Discogs credit.
        // Folders keep the article first ("Beatles, The" tags → "The Beatles").
        const target = sanitizeFilename(unsortArtist(tagged).replace(/\s*\/\s*/g, ', '));
        const letterDir = layout.letterDir ?? '';
        const letter = /^[A-Z0-9]$/i.test(letterDir) ? expectedLetter(target) : undefined;
        const otherLetter = letter && letter !== letterDir.toUpperCase() ? letter : undefined;
        actions.push({
          label: `Move the album to artist folder "${otherLetter ? `${otherLetter}/` : ''}${target}" (the tags' name)`,
          run: () => moveToArtist(layout, target, otherLetter),
        });
      }
      return actions;
    }

    // ── MODERATE: duplicates — manual only ────────────────────────────────
    case 'DUPLICATE_TRACKS':
      return [
        {
          label: `Open album folder for manual review (no auto-fix for duplicates)`,
          run: async () => {
            console.log(chalk.dim(`  Folder: ${layout.albumPath}`));
            console.log(chalk.dim(`  Files:  ${audit.tracks.map((t) => t.fileName).join(', ')}`));
          },
        },
      ];

    // ── MODERATE: covers ──────────────────────────────────────────────────
    case 'MISSING_COVER':
    case 'BAD_COVER':
    case 'COVER_MISMATCH':
      return coverActions(issue, audit, token);

    case 'ARTIST_COVER_MISSING': {
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
    }

    default:
      return [];
  }
}
