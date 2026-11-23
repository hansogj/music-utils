import fs from 'node:fs/promises';

import { parseTrackNames } from './checks/names.js';
import type { TrackInfo } from './types.js';

// Audio quality of a track, read from the file's own headers (no external tool): FLAC's
// STREAMINFO (bit depth / sample rate: "16/44.1", "24/96"), an MP3's first frame and its
// Xing/Info/VBRI header ("320 kbps", "VBR ~245 kbps"). Shown in the album table only.

const HEAD_BYTES = 64 * 1024;

// FLAC: "fLaC", then the STREAMINFO block (always first). From byte 10 of its data: sample
// rate 20 bits, channels 3, bits per sample 5 (stored minus one).
export function flacQuality(head: Buffer): string | undefined {
  if (head.length < 42 || head.toString('latin1', 0, 4) !== 'fLaC' || (head[4] & 0x7f) !== 0) return undefined;
  const s = 8;
  const rate = (head[s + 10] << 12) | (head[s + 11] << 4) | (head[s + 12] >> 4);
  const bits = (((head[s + 12] & 0x01) << 4) | (head[s + 13] >> 4)) + 1;
  return rate ? `${bits}/${rate / 1000}` : undefined;
}

const MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES = [44100, 48000, 32000];

// The bytes an ID3v2 tag takes (its size is syncsafe: 7 bits a byte; + a footer).
function id3v2Size(head: Buffer): number {
  if (head.length < 10 || head.toString('latin1', 0, 3) !== 'ID3') return 0;
  const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
  return 10 + size + (head[5] & 0x10 ? 10 : 0);
}

// MP3 (MPEG layer III): the first frame's bitrate, or for VBR (a Xing or VBRI header) the
// average from the header's frame and byte counts. LAME's CBR header says "Info".
export function mp3Quality(head: Buffer): string | undefined {
  let i = id3v2Size(head);
  while (i + 4 <= head.length && !(head[i] === 0xff && (head[i + 1] & 0xe0) === 0xe0)) i++;
  if (i + 4 > head.length) return undefined;
  const version = (head[i + 1] >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (head[i + 1] >> 1) & 0x03; // 1 = layer III
  const rateIndex = (head[i + 2] >> 2) & 0x03;
  if (version === 1 || layer !== 1 || rateIndex === 3) return undefined;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? MPEG1_L3 : MPEG2_L3)[head[i + 2] >> 4];
  const sampleRate = RATES[rateIndex] / (mpeg1 ? 1 : version === 2 ? 2 : 4);
  const mono = head[i + 3] >> 6 === 3;
  const samplesPerFrame = mpeg1 ? 1152 : 576;
  const vbr = (frames: number, bytes: number) =>
    frames && bytes ? `VBR ~${Math.round((bytes * 8 * sampleRate) / (frames * samplesPerFrame) / 1000)} kbps` : 'VBR';

  const x = i + 4 + (mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17);
  if (head.toString('latin1', x, x + 4) === 'Xing' && x + 16 <= head.length) {
    const flags = head.readUInt32BE(x + 4);
    const frames = flags & 1 ? head.readUInt32BE(x + 8) : 0;
    const bytes = flags & 2 ? head.readUInt32BE(x + 8 + (flags & 1 ? 4 : 0)) : 0;
    return vbr(frames, bytes);
  }
  const v = i + 36;
  if (head.toString('latin1', v, v + 4) === 'VBRI' && v + 18 <= head.length) {
    return vbr(head.readUInt32BE(v + 14), head.readUInt32BE(v + 10));
  }
  return bitrate ? `${bitrate} kbps` : undefined;
}

export async function readQuality(filePath: string, ext: 'mp3' | 'flac'): Promise<string | undefined> {
  let file: fs.FileHandle | undefined;
  try {
    file = await fs.open(filePath, 'r');
    const { buffer, bytesRead } = await file.read(Buffer.alloc(HEAD_BYTES), 0, HEAD_BYTES, 0);
    const head = buffer.subarray(0, bytesRead);
    return ext === 'flac' ? flacQuality(head) : mp3Quality(head);
  } catch {
    return undefined;
  } finally {
    await file?.close();
  }
}

export interface TrackQuality {
  ext: 'mp3' | 'flac';
  no: string; // "7", or "2-07" when the folder holds several discs
  quality?: string;
}

const toNumber = (s: string | undefined) => {
  const n = parseInt(s ?? '', 10);
  return Number.isNaN(n) ? undefined : n;
};

// Each track's quality with its number: the TRACKNUMBER (DISCNUMBER) tag, else the file
// name's number, else its place in the folder.
export async function albumQuality(tracks: TrackInfo[]): Promise<TrackQuality[]> {
  const fromNames = parseTrackNames(tracks.map((t) => t.fileName));
  const numbers = tracks.map((t, i) => {
    const tagged = toNumber(t.tags.trackNo);
    const no = tagged ?? fromNames[i].no ?? i + 1;
    const disc = (tagged !== undefined ? toNumber(t.tags.discNumber) : fromNames[i].disc) ?? 1;
    return { disc, no };
  });
  const discs = new Set(numbers.map((n) => n.disc)).size > 1;
  return Promise.all(
    tracks.map(async (t, i) => {
      const quality = await readQuality(t.filePath, t.ext);
      const { disc, no } = numbers[i];
      const label = discs ? `${disc}-${String(no).padStart(2, '0')}` : String(no);
      return { ext: t.ext, no: label, ...(quality ? { quality } : {}) };
    }),
  );
}

// "7" → "8", "2-07" → "2-08".
const following = (no: string) => no.replace(/\d+$/, (n) => String(Number(n) + 1).padStart(n.length, '0'));

// Track numbers as a list, runs of three or more joined: [1–11, 13, 14].
export function trackList(nos: string[]): string {
  const sorted = [...nos].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const runs: string[][] = [];
  for (const no of sorted) {
    const run = runs.at(-1);
    if (run && following(run.at(-1)!) === no) run.push(no);
    else runs.push([no]);
  }
  return `[${runs.flatMap((r) => (r.length > 2 ? [`${r[0]}–${r.at(-1)}`] : r)).join(', ')}]`;
}

// The Format row's read formats with their quality: "FLAC 16/44.1"; when the tracks differ,
// each quality with its track numbers: "FLAC 16/44.1 [1–11] · 24/96 [12]",
// "FLAC 16/44.1 [1–5] · MP3 320 kbps [6, 7]". A file whose quality can't be read shows its
// format alone ("FLAC [3]").
export function qualitySummary(tracks: TrackQuality[]): string {
  const groups = new Map<string, { ext: string; quality?: string; nos: string[] }>();
  for (const t of tracks) {
    const key = `${t.ext} ${t.quality ?? ''}`;
    const group = groups.get(key) ?? { ext: t.ext, ...(t.quality ? { quality: t.quality } : {}), nos: [] };
    group.nos.push(t.no);
    groups.set(key, group);
  }
  const list = [...groups.values()].sort((a, b) =>
    a.ext === b.ext ? b.nos.length - a.nos.length : a.ext === 'flac' ? -1 : 1,
  );
  const mixed = list.length > 1;
  return list
    .map((g, i) => {
      const sameFormat = i > 0 && list[i - 1].ext === g.ext && g.quality && list[i - 1].quality;
      return [sameFormat ? '' : g.ext.toUpperCase(), g.quality, mixed ? trackList(g.nos) : '']
        .filter(Boolean)
        .join(' ');
    })
    .join(' · ');
}
