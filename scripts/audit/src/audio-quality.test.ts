import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { albumQuality, flacQuality, mp3Quality, qualitySummary, readQuality, trackList } from './audio-quality.js';
import type { TrackInfo } from './types.js';

// A FLAC file's first bytes: "fLaC" + the STREAMINFO block header + its 34 bytes.
function flacHead(sampleRate: number, bits: number): Buffer {
  const b = Buffer.alloc(42);
  b.write('fLaC', 0, 'latin1');
  b[4] = 0x80; // last block, type 0 (STREAMINFO)
  b[7] = 34;
  const s = 8;
  b[s + 10] = sampleRate >> 12;
  b[s + 11] = (sampleRate >> 4) & 0xff;
  b[s + 12] = ((sampleRate & 0x0f) << 4) | (1 << 1) | ((bits - 1) >> 4); // 2 channels
  b[s + 13] = ((bits - 1) & 0x0f) << 4;
  return b;
}

// An MPEG1 layer III frame header (44.1 kHz), optionally with an ID3v2 tag before it and a
// Xing/Info header (stereo: 32 bytes of side info) or VBRI header in it.
function mp3Head(opts: { bitrateIndex?: number; id3?: number; xing?: 'Xing' | 'Info'; vbri?: boolean } = {}) {
  const id3 = opts.id3
    ? Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00', 'latin1'), Buffer.from([opts.id3])])
    : Buffer.alloc(0);
  const frame = Buffer.alloc(200);
  frame.set([0xff, 0xfb, (opts.bitrateIndex ?? 14) << 4, 0x00]);
  if (opts.xing) {
    frame.write(opts.xing, 36, 'latin1');
    frame.writeUInt32BE(3, 40); // frames + bytes
    frame.writeUInt32BE(1000, 44); // frames
    frame.writeUInt32BE(1000 * 640, 48); // bytes: 640 a frame ≈ 196 kbps
  }
  if (opts.vbri) {
    frame.write('VBRI', 36, 'latin1');
    frame.writeUInt32BE(1000 * 800, 46); // bytes ≈ 245 kbps
    frame.writeUInt32BE(1000, 50); // frames
  }
  return Buffer.concat([id3, Buffer.alloc(opts.id3 ?? 0), frame]);
}

describe('flacQuality', () => {
  it('reads bit depth and sample rate', () => {
    expect(flacQuality(flacHead(44100, 16))).toBe('16/44.1');
    expect(flacQuality(flacHead(96000, 24))).toBe('24/96');
  });

  it('is undefined for something else', () => {
    expect(flacQuality(Buffer.from('{"title":"x"}'))).toBeUndefined();
  });
});

describe('mp3Quality', () => {
  it('reads a CBR bitrate, also behind an ID3v2 tag and with LAME’s Info header', () => {
    expect(mp3Quality(mp3Head())).toBe('320 kbps');
    expect(mp3Quality(mp3Head({ bitrateIndex: 9, id3: 40 }))).toBe('128 kbps');
    expect(mp3Quality(mp3Head({ xing: 'Info' }))).toBe('320 kbps');
  });

  it('averages a VBR file from its Xing or VBRI header', () => {
    expect(mp3Quality(mp3Head({ bitrateIndex: 9, xing: 'Xing' }))).toBe('VBR ~196 kbps');
    expect(mp3Quality(mp3Head({ vbri: true }))).toBe('VBR ~245 kbps');
  });

  it('is undefined without an MPEG layer III frame', () => {
    expect(mp3Quality(Buffer.from('{"title":"x"}'))).toBeUndefined();
    expect(mp3Quality(Buffer.from([0xff, 0xfd, 0x90, 0x00]))).toBeUndefined(); // layer II
  });
});

describe('readQuality / albumQuality', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'quality-test-'));
  const track = (fileName: string, head: Buffer, tags: TrackInfo['tags'] = {}): TrackInfo => {
    const filePath = path.join(dir, fileName);
    writeFileSync(filePath, head);
    return { filePath, fileName, ext: fileName.endsWith('.mp3') ? 'mp3' : 'flac', tags, parsedName: undefined };
  };

  it('is undefined for a file that can’t be read', async () => {
    expect(await readQuality(path.join(dir, 'gone.flac'), 'flac')).toBeUndefined();
  });

  it('numbers tracks by tag, else file name, else place; discs only when the folder has several', async () => {
    const tracks = [
      track('01 - A.flac', flacHead(44100, 16), { trackNo: '1' }),
      track('02 - B.flac', flacHead(96000, 24)),
      track('C.mp3', mp3Head()),
    ];
    expect(await albumQuality(tracks)).toEqual([
      { ext: 'flac', no: '1', quality: '16/44.1' },
      { ext: 'flac', no: '2', quality: '24/96' },
      { ext: 'mp3', no: '3', quality: '320 kbps' },
    ]);
    const discs = [track('d1t01 A.flac', Buffer.alloc(0)), track('d2t01 B.flac', flacHead(44100, 16))];
    expect(await albumQuality(discs)).toEqual([
      { ext: 'flac', no: '1-01' },
      { ext: 'flac', no: '2-01', quality: '16/44.1' },
    ]);
  });
});

describe('trackList', () => {
  it('joins runs of three or more', () => {
    expect(trackList(['3', '1', '2', '5', '10', '11'])).toBe('[1–3, 5, 10, 11]');
    expect(trackList(['1-08', '1-09', '1-10', '2-01'])).toBe('[1-08–1-10, 2-01]');
  });
});

describe('qualitySummary', () => {
  const q = (ext: 'mp3' | 'flac', quality: string | undefined, ...nos: number[]) =>
    nos.map((no) => ({ ext, no: String(no), ...(quality ? { quality } : {}) }));

  it('shows one quality alone', () => {
    expect(qualitySummary(q('flac', '16/44.1', 1, 2, 3))).toBe('FLAC 16/44.1');
    expect(qualitySummary(q('mp3', 'VBR ~245 kbps', 1, 2))).toBe('MP3 VBR ~245 kbps');
  });

  it('lists the tracks of each quality when they differ, most first, FLAC before MP3', () => {
    expect(qualitySummary([...q('flac', '24/96', 12), ...q('flac', '16/44.1', 1, 2, 3)])).toBe(
      'FLAC 16/44.1 [1–3] · 24/96 [12]',
    );
    expect(qualitySummary([...q('mp3', '320 kbps', 6, 7), ...q('flac', '16/44.1', 1, 2, 3, 4, 5)])).toBe(
      'FLAC 16/44.1 [1–5] · MP3 320 kbps [6, 7]',
    );
  });

  it('shows the format alone for files it couldn’t read', () => {
    expect(qualitySummary([...q('flac', '16/44.1', 1, 2), ...q('flac', undefined, 3)])).toBe(
      'FLAC 16/44.1 [1, 2] · FLAC [3]',
    );
    expect(qualitySummary(q('flac', undefined, 1, 2))).toBe('FLAC');
  });
});
