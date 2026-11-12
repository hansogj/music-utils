import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendChangeset,
  CHANGESET_HEADER,
  infoTxtIdLines,
  joinChangeset,
  splitChangeset,
  writeInfoTxt,
} from './info-txt.js';

describe('infoTxtIdLines', () => {
  it('writes release, master and disc as fixed Key: value lines', () => {
    expect(infoTxtIdLines({ releaseId: '9004392', masterId: 123456 }, { discNumber: '1', noOfDiscs: '2' })).toEqual([
      'Discogs-Release: 9004392',
      'Discogs-Master: 123456',
      'Disc: 1/2',
      '',
    ]);
  });

  it('leaves out the master line when the release has no master', () => {
    expect(infoTxtIdLines({ releaseId: '42' })).toEqual(['Discogs-Release: 42', '']);
  });
});

describe('info.txt changeset and unchanged writes', () => {
  let dir: string;
  const release = { releaseId: '42', title: 'Tourmato', year: '1992', artists: ['Yes'], tracklist: [] };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'info-txt-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const read = () => fs.readFile(path.join(dir, 'info.txt'), 'utf8');

  it('leaves a file whose text would not change alone', async () => {
    expect(await writeInfoTxt(dir, release, 'Yes')).toBe(true);
    const old = new Date('2020-01-01T00:00:00Z');
    await fs.utimes(path.join(dir, 'info.txt'), old, old);
    expect(await writeInfoTxt(dir, release, 'Yes')).toBe(false);
    expect((await fs.stat(path.join(dir, 'info.txt'))).mtime).toEqual(old);
  });

  it('appends dated changes at the bottom and keeps the rest of the file', async () => {
    await fs.writeFile(path.join(dir, 'info.txt'), 'Yes - Tourmato\n\nMy own notes\n');
    await appendChangeset(
      dir,
      'folder name was changed from "1979 Tourmato" to "1992 Tourmato [live 1979]"',
      new Date(2026, 10, 12, 9, 5),
    );
    await appendChangeset(dir, 'second change', new Date(2026, 10, 12, 10, 45));
    expect(await read()).toBe(
      'Yes - Tourmato\n\nMy own notes\n\n' +
        `${CHANGESET_HEADER}\n` +
        '[2026-11-12 09:05]: folder name was changed from "1979 Tourmato" to "1992 Tourmato [live 1979]"\n' +
        '[2026-11-12 10:45]: second change\n',
    );
  });

  it('keeps the changeset when info.txt is written again from Discogs', async () => {
    await writeInfoTxt(dir, release, 'Yes');
    await appendChangeset(dir, 'a change', new Date(2026, 10, 12, 9, 5));
    expect(await writeInfoTxt(dir, { ...release, releaseId: '43' }, 'Yes')).toBe(true);
    const text = await read();
    expect(text).toMatch(/Discogs-Release: 43\n\n={15}Changeset={14}\n\[2026-11-12 09:05\]: a change\n$/);
    expect(await writeInfoTxt(dir, { ...release, releaseId: '43' }, 'Yes')).toBe(false);
  });

  it('starts a file holding only the changeset when there is none', async () => {
    await appendChangeset(dir, 'x', new Date(2026, 0, 2, 3, 4));
    expect(await read()).toBe(`${CHANGESET_HEADER}\n[2026-01-02 03:04]: x\n`);
  });

  it('splitChangeset reads back what joinChangeset wrote', () => {
    expect(splitChangeset(joinChangeset('body\n', ['a', 'b']))).toEqual({ body: 'body\n\n', entries: ['a', 'b'] });
    expect(splitChangeset('no section')).toEqual({ body: 'no section', entries: [] });
  });
});
