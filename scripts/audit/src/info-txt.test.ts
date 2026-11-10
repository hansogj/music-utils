import { describe, expect, it } from 'vitest';

import { infoTxtIdLines } from './info-txt.js';

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
