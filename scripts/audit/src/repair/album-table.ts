import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';

import { termLink } from '../term-link.js';
import { type AlbumAudit } from '../types.js';
import { albumMetaFromLayout } from './folder.js';
import { yearLabel } from './release-picker.js';

// The album table that opens each album in repair.

// Audio formats seen in album folders. Only mp3 and flac are read and checked.
const AUDIO_EXTS = [
  'flac',
  'mp3',
  'wav',
  'aiff',
  'aif',
  'm4a',
  'alac',
  'ape',
  'wv',
  'ogg',
  'opus',
  'dsf',
  'dff',
  'wma',
];
const CHECKED_EXTS = new Set(['flac', 'mp3']);

// The audio files in the folder by format, most first: "FLAC" · "FLAC 5 · MP3 2" ·
// "FLAC 7 · WAV 2 (not checked)". `other` lists formats the audit doesn't read.
export function formatSummary(fileNames: string[]): { checked: string; other: string } {
  const counts = new Map<string, number>();
  for (const name of fileNames) {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (AUDIO_EXTS.includes(ext)) counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  const formats = [...counts].sort((a, b) => b[1] - a[1] || AUDIO_EXTS.indexOf(a[0]) - AUDIO_EXTS.indexOf(b[0]));
  const label = ([ext, n]: [string, number]) => `${ext.toUpperCase()}${formats.length > 1 ? ` ${n}` : ''}`;
  const join = (list: Array<[string, number]>) => list.map(label).join(' · ');
  const other = join(formats.filter(([ext]) => !CHECKED_EXTS.has(ext)));
  return { checked: join(formats.filter(([ext]) => CHECKED_EXTS.has(ext))), other: other && `${other} (not checked)` };
}

export async function folderFiles(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export function printAlbumTable(audit: AlbumAudit, fileNames: string[]): void {
  const { layout, tracks, discogsResults } = audit;
  const meta = albumMetaFromLayout(layout);

  const taggedTracks = tracks.filter((t) => t.tags.title || t.tags.artist || t.tags.album);
  const missingTitle = tracks.filter((t) => !t.tags.title).length;
  const tagStatus =
    taggedTracks.length === tracks.length
      ? chalk.green(`${tracks.length} / ${tracks.length}`)
      : chalk.yellow(`${taggedTracks.length} / ${tracks.length}`) + chalk.dim(` (${missingTitle} missing title)`);

  // Formats the audit doesn't read in yellow: those files aren't checked or tagged.
  const formats = formatSummary(fileNames);
  const formatCell =
    [formats.checked && chalk.white(formats.checked), formats.other && chalk.yellow(formats.other)]
      .filter(Boolean)
      .join(' · ') || chalk.dim('(no audio files)');
  const rows: [string, string][] = [
    ['Artist', chalk.white(meta.artist)],
    ['Album', chalk.white(meta.album || chalk.dim('(unknown)'))],
    ['Year', meta.year ? chalk.white(meta.year) : chalk.dim('(not in folder name)')],
    ['Disc', chalk.white(`${meta.discNumber} / ${meta.noOfDiscs}`)],
    ['Tracks', tagStatus],
    ['Format', formatCell],
    ['Path', chalk.dim(layout.albumPath)],
  ];

  if (discogsResults && discogsResults.length > 0) {
    rows.push(['', '']);
    rows.push([chalk.bold('Discogs'), '']);
    const bestScore = Math.max(...discogsResults.map((x) => x.matchScore ?? -1));
    for (const r of discogsResults) {
      const yr = yearLabel(r);
      const star = r.matchScore !== undefined && r.matchScore === bestScore ? '★ ' : '  ';
      const score =
        r.matchScore !== undefined
          ? chalk.dim(` ${Math.round(r.matchScore * 100)}%${r.trackCount !== undefined ? ` · ${r.trackCount}tr` : ''}`)
          : '';
      const label = `${star}[${r.id}] ${r.title}${yr}`;
      rows.push(['  release', termLink(chalk.cyan(label), r.releaseUrl) + score]);
      if (r.masterUrl) rows.push(['  master', termLink(chalk.dim('open master'), r.masterUrl)]);
    }
  }

  const COL1 = 10;
  console.log(chalk.dim('  ┌' + '─'.repeat(COL1 + 2) + '┬' + '─'.repeat(45) + '┐'));
  for (const [label, value] of rows) {
    if (!label && !value) {
      console.log(chalk.dim('  ├' + '─'.repeat(COL1 + 2) + '┼' + '─'.repeat(45) + '┤'));
      continue;
    }
    const paddedLabel = label.padEnd(COL1);
    console.log(chalk.dim('  │ ') + chalk.dim(paddedLabel) + chalk.dim(' │ ') + value);
  }
  console.log(chalk.dim('  └' + '─'.repeat(COL1 + 2) + '┴' + '─'.repeat(45) + '┘'));
}
