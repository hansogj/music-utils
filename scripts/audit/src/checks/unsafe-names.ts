import path from 'node:path';

import { sanitizeFilename, sanitizeTitle } from '../rename-plan.js';
import type { AlbumLayout, Issue, TrackInfo } from '../types.js';

// Names an SMB share can't carry: " * : < > ? \ | anywhere, a space or "." at the end. A
// Synology share stores them as private-use characters (Apple's SFM mapping), so the name
// has two spellings: "Pirates Of The Caribbean: …" over SMB, U+F022 on the NAS itself.

// SFM private-use characters back to what they stand for (seen when run on the NAS).
const SFM: Record<string, string> = {
  '\uF020': '"',
  '\uF021': '*',
  '\uF022': ':',
  '\uF023': '<',
  '\uF024': '>',
  '\uF025': '?',
  '\uF026': '\\',
  '\uF027': '|',
  '\uF028': ' ',
  '\uF029': '.',
};
export const fromSfm = (name: string) => name.replace(/[\uF020-\uF029]/g, (c) => SFM[c]);

// Artist names keep a trailing dot: "I.P.A.", "V.S.O.P." — the dots are the name.
const UNSAFE_ARTIST = /[:*?"<>|\\\uF020-\uF028]|\s$/;
const UNSAFE_TITLE = /[:*?"<>|\\\uF020-\uF029]|[\s.]$/;

// The safe names, as music-audit's renames make them (sanitizeFilename() / sanitizeTitle()).
export const safeArtistFolder = (name: string) => sanitizeFilename(fromSfm(name));
export const safeAlbumFolder = (name: string) => sanitizeTitle(fromSfm(name));
export function safeFileName(name: string): string {
  const ext = path.extname(name);
  return `${sanitizeTitle(fromSfm(name.slice(0, name.length - ext.length)))}${ext}`;
}

// UNSAFE_ARTIST_NAME, UNSAFE_FOLDER_NAME (the album folder), UNSAFE_FILE_NAME (its tracks).
export function checkUnsafeNames(layout: AlbumLayout, tracks: TrackInfo[]): Issue[] {
  const issues: Issue[] = [];
  const why = "has characters an SMB share can't hold";
  if (UNSAFE_ARTIST.test(layout.artistName)) {
    const safe = safeArtistFolder(layout.artistName);
    issues.push({
      severity: 'HIGH',
      code: 'UNSAFE_ARTIST_NAME',
      message: `Artist folder "${layout.artistName}" ${why}`,
      ...(safe ? { suggestion: `Rename to "${safe}"` } : {}),
    });
  }
  if (UNSAFE_TITLE.test(layout.albumFolder)) {
    const safe = safeAlbumFolder(layout.albumFolder);
    issues.push({
      severity: 'HIGH',
      code: 'UNSAFE_FOLDER_NAME',
      message: `Album folder "${layout.albumFolder}" ${why}`,
      ...(safe ? { suggestion: `Rename to "${safe}"` } : {}),
    });
  }
  const files = tracks.filter((t) => UNSAFE_TITLE.test(t.fileName));
  if (files.length > 0)
    issues.push({
      severity: 'HIGH',
      code: 'UNSAFE_FILE_NAME',
      message: `${files.length} file name(s) ${why} (${files[0].fileName})`,
      suggestion: `Rename to "${safeFileName(files[0].fileName)}"${files.length > 1 ? ' and so on' : ''}`,
    });
  return issues;
}
