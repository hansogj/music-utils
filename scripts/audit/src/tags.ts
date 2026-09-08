import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TrackTags } from './types.js';

const execFileAsync = promisify(execFile);

const FLAC_TAGS = ['TITLE', 'TRACKNUMBER', 'TRACKTOTAL', 'ARTIST', 'ALBUMARTIST', 'ALBUM', 'DATE', 'DISCNUMBER', 'TOTALDISCS', 'GENRE', 'COMMENT', 'DESCRIPTION'];

export async function readFlacTags(filePath: string): Promise<{ tags: TrackTags; error?: string }> {
  try {
    const args = [...FLAC_TAGS.map((t) => `--show-tag=${t}`), filePath];
    const { stdout } = await execFileAsync('metaflac', args);
    const raw: Record<string, string> = {};

    stdout
      .split('\n')
      .filter(Boolean)
      .forEach((line) => {
        const eq = line.indexOf('=');
        if (eq > 0) {
          const key = line.slice(0, eq).trim().toUpperCase();
          const val = line.slice(eq + 1).trim();
          raw[key] = val;
        }
      });

    return {
      tags: {
        title: raw['TITLE'],
        trackNo: raw['TRACKNUMBER'],
        trackNoTotal: raw['TRACKTOTAL'],
        artist: raw['ARTIST'],
        albumArtist: raw['ALBUMARTIST'],
        album: raw['ALBUM'],
        year: raw['DATE'],
        discNumber: raw['DISCNUMBER'],
        noOfDiscs: raw['TOTALDISCS'],
        genre: raw['GENRE'],
        comment: raw['DESCRIPTION'] ?? raw['COMMENT'],
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('command not found') || msg.includes('ENOENT')) {
      return { tags: {}, error: 'metaflac not installed' };
    }
    return { tags: {}, error: msg };
  }
}

export async function readMp3Tags(filePath: string): Promise<{ tags: TrackTags; error?: string }> {
  try {
    const { stdout } = await execFileAsync('id3v2', ['-l', filePath]);
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const raw: Record<string, string> = {};

    for (const line of lines) {
      // id3v2 output: "TIT2 (Title/songname/content description): value"
      const match = line.match(/^([A-Z0-9]{4})\s*(?:\([^)]*\))?\s*:\s*(.+)$/);
      if (match) {
        raw[match[1]] = match[2].trim();
      }
    }

    // Also try id3v1 fallback for Title and Track
    if (!raw['TIT2']) {
      const titleMatch = stdout.match(/Title\s*:\s*(.+?)\s+Artist/s);
      if (titleMatch) raw['TIT2'] = titleMatch[1].trim();
    }

    const trck = raw['TRCK']?.split('/') ?? [];
    const tpos = raw['TPOS']?.split('/') ?? [];

    // Strip genre IDs like "(17)" from TCON
    const rawGenre = raw['TCON'];
    const genre = rawGenre ? rawGenre.replace(/\(\d+\)/g, '').trim() || rawGenre.match(/\((\d+)\)/)?.[1] : undefined;

    return {
      tags: {
        title: raw['TIT2'],
        trackNo: trck[0],
        trackNoTotal: trck[1],
        artist: raw['TPE1'],
        albumArtist: raw['TPE2'],
        album: raw['TALB'],
        year: raw['TYER'] ?? raw['TDRC'],
        discNumber: tpos[0],
        noOfDiscs: tpos[1],
        genre: genre?.toString(),
        comment: raw['COMM'],
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('command not found') || msg.includes('ENOENT')) {
      return { tags: {}, error: 'id3v2 not installed' };
    }
    return { tags: {}, error: msg };
  }
}

export async function readTags(filePath: string, ext: 'flac' | 'mp3'): Promise<{ tags: TrackTags; error?: string }> {
  return ext === 'flac' ? readFlacTags(filePath) : readMp3Tags(filePath);
}
