import fs from 'node:fs/promises';

// Minimal ID3v2.3/2.4 frame editor for the frames id3v2 0.1.12 can't write: it keeps only
// one TXXX frame per file (each --TXXX replaces it, whatever its description) and splits a
// comment at ':' (a URL became description "https" + text "//www…").
// Every other frame is copied byte for byte: cover art, extra comments (iTunNORM…), the lot.

export interface Frame {
  id: string;
  flags: Buffer;
  data: Buffer;
}

interface Tag {
  major: 3 | 4;
  revision: number;
  flags: number;
  frames: Frame[];
  // Byte offset where the tag ends and the audio starts (0 without a tag).
  end: number;
}

export interface Comment {
  lang: string;
  desc: string;
  text: string;
}

const syncsafe = (buf: Buffer, at: number) =>
  ((buf[at] & 0x7f) << 21) | ((buf[at + 1] & 0x7f) << 14) | ((buf[at + 2] & 0x7f) << 7) | (buf[at + 3] & 0x7f);

function toSyncsafe(n: number): Buffer {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

export function parseTag(buf: Buffer): Tag | undefined {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return undefined;
  const major = buf[3];
  if (major !== 3 && major !== 4) throw new Error(`ID3v2.${major} tags are not supported`);
  const flags = buf[5];
  // Unsynchronisation, extended header, footer: rare, and not worth guessing at.
  if (flags & 0xd0) throw new Error(`ID3 tag with header flags 0x${flags.toString(16)} is not supported`);
  const end = 10 + syncsafe(buf, 6);
  if (end > buf.length) throw new Error('ID3 tag is longer than the file');

  const frames: Frame[] = [];
  let pos = 10;
  while (pos + 10 <= end && buf[pos] !== 0) {
    const id = buf.toString('latin1', pos, pos + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) throw new Error(`Unreadable ID3 frame at byte ${pos}`);
    const size = major === 4 ? syncsafe(buf, pos + 4) : buf.readUInt32BE(pos + 4);
    if (pos + 10 + size > end) throw new Error(`ID3 frame ${id} runs past the end of the tag`);
    frames.push({ id, flags: buf.subarray(pos + 8, pos + 10), data: buf.subarray(pos + 10, pos + 10 + size) });
    pos += 10 + size;
  }
  return { major, revision: buf[4], flags, frames, end };
}

function serializeTag(tag: Tag, padding = 1024): Buffer {
  const frames = tag.frames.map((f) => {
    const header = Buffer.alloc(10);
    header.write(f.id, 0, 'latin1');
    if (tag.major === 4) toSyncsafe(f.data.length).copy(header, 4);
    else header.writeUInt32BE(f.data.length, 4);
    f.flags.copy(header, 8);
    return Buffer.concat([header, f.data]);
  });
  const body = Buffer.concat([...frames, Buffer.alloc(padding)]);
  const header = Buffer.concat([
    Buffer.from('ID3', 'latin1'),
    Buffer.from([tag.major, tag.revision, tag.flags]),
    toSyncsafe(body.length),
  ]);
  return Buffer.concat([header, body]);
}

// ── text encoding (first byte of a text frame) ──────────────────────────────

function decode(enc: number, buf: Buffer): string {
  if (enc === 1) {
    if (buf[0] === 0xfe && buf[1] === 0xff) return swap16(buf.subarray(2)).toString('utf16le');
    return buf.subarray(buf[0] === 0xff && buf[1] === 0xfe ? 2 : 0).toString('utf16le');
  }
  if (enc === 2) return swap16(buf).toString('utf16le');
  if (enc === 3) return buf.toString('utf8');
  return buf.toString('latin1');
}

function swap16(buf: Buffer): Buffer {
  const out = Buffer.from(buf.subarray(0, buf.length - (buf.length % 2)));
  return out.swap16();
}

// Splits at the first terminator: one 0x00 for latin1/utf8, two (at an even offset) for utf16.
function splitTerminated(enc: number, buf: Buffer): [Buffer, Buffer] {
  if (enc === 1 || enc === 2) {
    for (let i = 0; i + 1 < buf.length; i += 2) {
      if (buf[i] === 0 && buf[i + 1] === 0) return [buf.subarray(0, i), buf.subarray(i + 2)];
    }
    return [buf, Buffer.alloc(0)];
  }
  const i = buf.indexOf(0);
  return i < 0 ? [buf, Buffer.alloc(0)] : [buf.subarray(0, i), buf.subarray(i + 1)];
}

const stripNul = (s: string) => s.replace(/\0+$/, '');

// latin1 when it fits, else UTF-16 with BOM (valid in both v2.3 and v2.4).
function encodeTexts(...texts: string[]): { enc: number; parts: Buffer[] } {
  if (texts.every((t) => /^[\u0000-ÿ]*$/.test(t))) {
    return { enc: 0, parts: texts.map((t) => Buffer.from(t, 'latin1')) };
  }
  return { enc: 1, parts: texts.map((t) => Buffer.from(`﻿${t}`, 'utf16le')) };
}

// Frames with compression/encryption/etc. flags are left alone, never read as ours.
const plainFlags = (f: Frame) => f.flags[0] === 0 && f.flags[1] === 0;

export function readTxxx(f: Frame): { desc: string; value: string } | undefined {
  if (f.id !== 'TXXX' || !plainFlags(f) || f.data.length < 1) return undefined;
  const enc = f.data[0];
  const [desc, value] = splitTerminated(enc, f.data.subarray(1));
  return { desc: decode(enc, desc), value: stripNul(decode(enc, value)) };
}

export function readComm(f: Frame): Comment | undefined {
  if (f.id !== 'COMM' || !plainFlags(f) || f.data.length < 4) return undefined;
  const enc = f.data[0];
  const [desc, text] = splitTerminated(enc, f.data.subarray(4));
  return { lang: f.data.toString('latin1', 1, 4), desc: decode(enc, desc), text: stripNul(decode(enc, text)) };
}

export function buildTxxx(desc: string, value: string): Frame {
  const { enc, parts } = encodeTexts(desc, value);
  const term = Buffer.alloc(enc === 0 ? 1 : 2);
  return { id: 'TXXX', flags: Buffer.alloc(2), data: Buffer.concat([Buffer.from([enc]), parts[0], term, parts[1]]) };
}

export function buildComm(lang: string, desc: string, text: string): Frame {
  const { enc, parts } = encodeTexts(desc, text);
  const term = Buffer.alloc(enc === 0 ? 1 : 2);
  const langBuf = Buffer.from(lang.padEnd(3, ' ').slice(0, 3), 'latin1');
  return {
    id: 'COMM',
    flags: Buffer.alloc(2),
    data: Buffer.concat([Buffer.from([enc]), langBuf, parts[0], term, parts[1]]),
  };
}

// The comment frames we own: the plain one, and the split one old id3v2 writes left
// behind (description "https"/"http", text "//www.discogs.com/…").
const isOwnComment = (c: Comment) => !c.desc || /^https?$/.test(c.desc);

export async function readFrames(filePath: string): Promise<Frame[]> {
  return parseTag(await fs.readFile(filePath))?.frames ?? [];
}

// Sets the comment (undefined: leave comments alone, '': remove ours) and TXXX frames
// (an empty value removes that frame), keeping every other frame and the audio as they are.
// Writes in place so the file keeps its owner (repair often runs under sudo).
export async function writeUserFrames(
  filePath: string,
  comment: string | undefined,
  userText: Array<[string, string]>,
): Promise<void> {
  const buf = await fs.readFile(filePath);
  const tag = parseTag(buf) ?? { major: 3 as const, revision: 0, flags: 0, frames: [], end: 0 };
  const keys = new Set(userText.map(([k]) => k));

  const kept = tag.frames.filter((f) => {
    const txxx = readTxxx(f);
    if (txxx && keys.has(txxx.desc)) return false;
    const comm = comment !== undefined ? readComm(f) : undefined;
    return !(comm && isOwnComment(comm));
  });
  const added = [
    ...userText.filter(([, v]) => v.trim()).map(([k, v]) => buildTxxx(k, v.trim())),
    ...(comment ? [buildComm('eng', '', comment)] : []),
  ];

  await fs.writeFile(
    filePath,
    Buffer.concat([serializeTag({ ...tag, frames: [...kept, ...added] }), buf.subarray(tag.end)]),
  );
}
