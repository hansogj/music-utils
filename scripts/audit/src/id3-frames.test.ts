import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildComm,
  buildTxxx,
  type Frame,
  parseTag,
  readComm,
  readFrames,
  readTxxx,
  writeUserFrames,
} from './id3-frames.js';

const URL = 'https://www.discogs.com/release/4376665';
const AUDIO = Buffer.from([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4, 5, 6, 7, 8]);

let dir: string;
let file: string;

const syncsafe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];

// An ID3 tag built by hand (frame sizes are plain in v2.3, syncsafe in v2.4).
// Audio files are gitignored, so tests never rely on test-data mp3s.
function tagBytes(frames: Frame[], major: 3 | 4 = 3, flags = 0): Buffer {
  const body = Buffer.concat(
    frames.map((f) => {
      const h = Buffer.alloc(10);
      h.write(f.id, 0, 'latin1');
      if (major === 4) Buffer.from(syncsafe(f.data.length)).copy(h, 4);
      else h.writeUInt32BE(f.data.length, 4);
      f.flags.copy(h, 8);
      return Buffer.concat([h, f.data]);
    }),
  );
  const n = body.length;
  return Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([major, 0, flags, ...syncsafe(n)]), body]);
}

const textFrame = (id: string, text: string): Frame => ({
  id,
  flags: Buffer.alloc(2),
  data: Buffer.concat([Buffer.from([0]), Buffer.from(text, 'latin1')]),
});
const picture = (kind: number): Frame => ({
  id: 'APIC',
  flags: Buffer.alloc(2),
  data: Buffer.concat([Buffer.from('\0image/jpeg\0', 'latin1'), Buffer.from([kind, 0]), Buffer.from([1, 2, 3, kind])]),
});

const txxx = async () =>
  Object.fromEntries(
    (await readFrames(file)).flatMap((f) => (readTxxx(f) ? [[readTxxx(f)!.desc, readTxxx(f)!.value]] : [])),
  );
const comments = async () => (await readFrames(file)).flatMap((f) => (readComm(f) ? [readComm(f)!] : []));

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'id3-frames-'));
  file = path.join(dir, 'track.mp3');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('frame codecs', () => {
  it('round-trip TXXX and COMM in latin1 and UTF-16', () => {
    expect(readTxxx(buildTxxx('DISCOGS_RELEASE_ID', '4376665'))).toEqual({
      desc: 'DISCOGS_RELEASE_ID',
      value: '4376665',
    });
    expect(readTxxx(buildTxxx('NOTE', 'Ærø – 東京'))).toEqual({ desc: 'NOTE', value: 'Ærø – 東京' });
    expect(readComm(buildComm('eng', '', URL))).toEqual({ lang: 'eng', desc: '', text: URL });
    expect(readComm(buildComm('nor', 'note', 'blåbær ✓'))).toEqual({ lang: 'nor', desc: 'note', text: 'blåbær ✓' });
  });

  it('reads UTF-16BE and UTF-8 text', () => {
    const be = Buffer.from('\0D\0E\0S\0\0\0v', 'latin1');
    expect(readTxxx({ id: 'TXXX', flags: Buffer.alloc(2), data: Buffer.concat([Buffer.from([2]), be]) })).toEqual({
      desc: 'DES',
      value: 'v',
    });
    const utf8 = Buffer.concat([Buffer.from([3]), Buffer.from('ø\0å', 'utf8')]);
    expect(readTxxx({ id: 'TXXX', flags: Buffer.alloc(2), data: utf8 })).toEqual({ desc: 'ø', value: 'å' });
  });

  it('does not read frames with flags (compressed, encrypted…) or of another type', () => {
    expect(readTxxx({ ...buildTxxx('A', '1'), flags: Buffer.from([0, 0x80]) })).toBeUndefined();
    expect(readComm(buildTxxx('A', '1'))).toBeUndefined();
  });
});

describe('writeUserFrames', () => {
  it('writes both Discogs IDs and the full URL into a file without a tag', async () => {
    await fs.writeFile(file, AUDIO);
    await writeUserFrames(file, URL, [
      ['DISCOGS_RELEASE_ID', '4376665'],
      ['DISCOGS_MASTER_ID', '245487'],
    ]);
    expect(await txxx()).toEqual({ DISCOGS_RELEASE_ID: '4376665', DISCOGS_MASTER_ID: '245487' });
    expect(await comments()).toEqual([{ lang: 'eng', desc: '', text: URL }]);
    const buf = await fs.readFile(file);
    expect(buf.subarray(parseTag(buf)!.end)).toEqual(AUDIO);
  });

  it('keeps every other frame byte for byte, and the audio', async () => {
    const others = [
      textFrame('TIT2', 'Hard Attack'),
      picture(3),
      picture(4), // front and back cover
      buildComm('eng', 'iTunNORM', '0000'),
      buildTxxx('OTHER', 'keep'),
      { ...buildTxxx('DISCOGS_RELEASE_ID', 'zip'), flags: Buffer.from([0, 0x80]) }, // compressed: not ours
    ];
    // The split URL comment old id3v2 writes left behind, and a stale release ID.
    const old = [buildComm('', 'https', '//www.discogs.com/release/1'), buildTxxx('DISCOGS_RELEASE_ID', '1')];
    await fs.writeFile(file, Buffer.concat([tagBytes([...others, ...old]), AUDIO]));

    await writeUserFrames(file, URL, [['DISCOGS_RELEASE_ID', '4376665']]);

    const buf = await fs.readFile(file);
    const tag = parseTag(buf)!;
    expect(tag.frames.slice(0, others.length)).toEqual(others);
    expect(tag.frames.slice(others.length).map((f) => [readTxxx(f), readComm(f)])).toEqual([
      [{ desc: 'DISCOGS_RELEASE_ID', value: '4376665' }, undefined],
      [undefined, { lang: 'eng', desc: '', text: URL }],
    ]);
    expect(buf.subarray(tag.end)).toEqual(AUDIO);
  });

  it('replaces its frames on a second write and removes one written empty', async () => {
    await fs.writeFile(file, AUDIO);
    await writeUserFrames(file, URL, [
      ['DISCOGS_RELEASE_ID', '1'],
      ['DISCOGS_MASTER_ID', '2'],
    ]);
    await writeUserFrames(file, URL, [
      ['DISCOGS_RELEASE_ID', '3'],
      ['DISCOGS_MASTER_ID', ''],
    ]);
    expect(await txxx()).toEqual({ DISCOGS_RELEASE_ID: '3' });
    expect(await comments()).toHaveLength(1);
  });

  it('leaves comments alone when no comment is given', async () => {
    await fs.writeFile(file, Buffer.concat([tagBytes([buildComm('eng', '', 'mine')]), AUDIO]));
    await writeUserFrames(file, undefined, [['DISCOGS_MASTER_ID', '2']]);
    expect(await comments()).toEqual([{ lang: 'eng', desc: '', text: 'mine' }]);
  });

  it('keeps a v2.4 tag as v2.4, with syncsafe frame sizes (as ffmpeg writes)', async () => {
    // A frame over 127 bytes: its v2.4 size differs from a plain 32-bit size.
    const long = textFrame('TSSE', `Lavf61.7.100 ${'x'.repeat(200)}`);
    await fs.writeFile(file, Buffer.concat([tagBytes([textFrame('TIT2', 'Hard Attack'), long], 4), AUDIO]));
    const before = parseTag(await fs.readFile(file))!;
    expect(before.frames.map((f) => f.id)).toEqual(['TIT2', 'TSSE']);
    expect(before.major).toBe(4);
    await writeUserFrames(file, URL, [['DISCOGS_RELEASE_ID', '4376665']]);
    const after = parseTag(await fs.readFile(file))!;
    expect(after.major).toBe(4);
    expect(after.frames.slice(0, before.frames.length)).toEqual(before.frames);
    expect(await txxx()).toEqual({ DISCOGS_RELEASE_ID: '4376665' });
    const buf = await fs.readFile(file);
    expect(buf.subarray(parseTag(buf)!.end)).toEqual(AUDIO);
  });

  it('refuses tags it cannot rewrite safely', async () => {
    await fs.writeFile(file, Buffer.concat([tagBytes([textFrame('TIT2', 'x')], 3, 0x80), AUDIO]));
    await expect(writeUserFrames(file, URL, [])).rejects.toThrow(/header flags 0x80/);
    await fs.writeFile(file, Buffer.concat([Buffer.from('ID3\x02\x00\x00\x00\x00\x00\x00', 'latin1'), AUDIO]));
    await expect(writeUserFrames(file, URL, [])).rejects.toThrow(/ID3v2.2/);
    const broken = tagBytes([textFrame('TIT2', 'x')]);
    broken.write('ti!2', 10, 'latin1');
    await fs.writeFile(file, Buffer.concat([broken, AUDIO]));
    await expect(writeUserFrames(file, URL, [])).rejects.toThrow(/Unreadable ID3 frame/);
  });
});
