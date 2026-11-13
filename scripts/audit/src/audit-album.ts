import fs from 'node:fs/promises';
import path from 'node:path';

import { checkDiscogsIds } from './checks/discogs-ids.js';
import { checkDuplicates } from './checks/duplicates.js';
import { checkFolderFormat } from './checks/folder.js';
import { checkNameTagMatch, matchNames, parseNameFromFilename } from './checks/names.js';
import { checkTags } from './checks/tags.js';
import { checkOriginalYear, originalYearLookupId } from './checks/year.js';
import { checkCovers } from './cover.js';
import { discogsCoverSource, fetchOriginalYear, searchDiscogs } from './discogs.js';
import { writeInfoTxtFromTags } from './info-txt.js';
import { readTags } from './tags.js';
import type { AlbumAudit, AlbumLayout, Issue, TrackInfo } from './types.js';
import { listMusicFiles } from './walk.js';

export interface AuditAlbumOptions {
  token?: string;
  // No Discogs calls at all.
  skipDiscogs?: boolean;
  // Search Discogs for release suggestions (only for albums with issues unless searchAlways).
  // Off for a repair re-scan, which keeps the suggestions from the first scan.
  search?: boolean;
  searchAlways?: boolean;
  // Opt-in original-year check (needs Discogs; cached on disk).
  checkYears?: boolean;
  // Repair mode only: write a basic info.txt from tags when the album has none.
  writeInfo?: boolean;
  // cover.jpg in the album and artist folders; compared with the Discogs cover when
  // Discogs is on (hashes cached on disk).
  checkCovers?: boolean;
}

export async function readTracks(layout: AlbumLayout): Promise<TrackInfo[]> {
  const files = await listMusicFiles(layout.albumPath);
  const tracks: TrackInfo[] = [];
  const names = files.map((f) => f.name);

  for (const { name, ext } of files) {
    const filePath = path.join(layout.albumPath, name);
    const { tags, error } = await readTags(filePath, ext);
    tracks.push({
      filePath,
      fileName: name,
      ext,
      tags,
      parsedName: parseNameFromFilename(name, names),
      tagReadError: error,
    });
  }

  return tracks;
}

export async function auditAlbum(layout: AlbumLayout, opts: AuditAlbumOptions = {}): Promise<AlbumAudit> {
  const {
    token,
    skipDiscogs = false,
    search = true,
    searchAlways = false,
    checkYears = false,
    writeInfo = false,
    checkCovers: covers = false,
  } = opts;
  const tracks = await readTracks(layout);
  const issues: Issue[] = [];

  issues.push(...checkFolderFormat(layout));

  // Consolidate tag issues to album level so repair only prompts once per album.
  const perTrackTagIssues = tracks.flatMap((t) => checkTags(t));
  const noTagTracks = perTrackTagIssues.filter((i) => i.code === 'NO_TAGS').map((i) => i.file!);
  const missingTagTracks = perTrackTagIssues.filter((i) => i.code === 'MISSING_TAGS').map((i) => i.file!);
  if (noTagTracks.length > 0)
    issues.push({ severity: 'HIGH', code: 'NO_TAGS', message: `${noTagTracks.length} track(s) have no tags` });
  if (missingTagTracks.length > 0)
    issues.push({
      severity: 'HIGH',
      code: 'MISSING_TAGS',
      message: `${missingTagTracks.length} track(s) have missing tags`,
    });
  issues.push(...perTrackTagIssues.filter((i) => i.code !== 'NO_TAGS' && i.code !== 'MISSING_TAGS'));

  for (const t of tracks) issues.push(...checkNameTagMatch(t));
  issues.push(...checkDuplicates(tracks));
  issues.push(...checkDiscogsIds(tracks));
  if (covers) issues.push(...(await checkCovers(layout, tracks, !skipDiscogs && token ? discogsCoverSource(token) : undefined)));

  let discogsResults = undefined;
  if (search && !skipDiscogs && token && (issues.length > 0 || searchAlways)) {
    try {
      const localNames = matchNames(tracks).filter(Boolean);
      discogsResults = await searchDiscogs(layout.artistName, layout.albumFolder, token, localNames);
    } catch {
      // Discogs rate-limit or network — silently skip per-album
    }
  }

  // Opt-in (--check-years / MUSIC_AUDIT_CHECK_YEARS): albums already tagged with a Discogs
  // release ID get their year checked against the original (master) year. Off by default
  // because it sends every tagged release ID to Discogs. Runs after the search so it
  // doesn't trigger one.
  let originalYear = undefined;
  const lookupId = checkYears && !skipDiscogs && token ? originalYearLookupId(layout, tracks) : undefined;
  if (lookupId && token) {
    try {
      originalYear = await fetchOriginalYear(lookupId, token);
      issues.push(...checkOriginalYear(layout, tracks, originalYear));
    } catch {
      // Discogs rate-limit or network — silently skip per-album
    }
  }

  // Repair mode only (report mode never writes): generate a basic info.txt from tags if none
  // exists yet. Discogs tagging will overwrite it with a richer version.
  if (writeInfo && tracks.length > 0) {
    const infoTxtPath = path.join(layout.albumPath, 'info.txt');
    try {
      await fs.access(infoTxtPath);
    } catch {
      writeInfoTxtFromTags(layout.albumPath, tracks).catch(() => {});
    }
  }

  return { layout, tracks, issues, discogsResults, originalYear };
}
