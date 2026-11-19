import { DEFAULT_CONFIG } from '../config/defaults';
import { DISC_LABEL, DISC_NO_SPLIT } from '../constants';
import { releaseTable } from './release-table';

describe('releaseTable', () => {
  it('shows the release as aligned rows, with folder and Discogs IDs', () => {
    expect(
      releaseTable(
        {
          artist: 'Yes',
          album: 'Yessongs',
          year: '1973',
          discNumber: '1',
          noOfDiscs: '3',
          discogs: { releaseId: '1234', masterId: 99, genre: 'Rock', url: 'https://www.discogs.com/release/1234' },
        },
        DEFAULT_CONFIG,
      ),
    ).toEqual([
      '  Artist   Yes',
      '  Album    Yessongs',
      '  Year     1973',
      '  Disc     1 of 3',
      '  Genre    Rock',
      `  Folder   Yes/1973 Yessongs (${DISC_LABEL} 1${DISC_NO_SPLIT}3)`,
      '  Discogs  r1234 · m99',
    ]);
  });

  it('leaves out empty fields, the disc of a single-disc release and a missing master', () => {
    expect(
      releaseTable(
        { artist: 'Magma', album: '', year: '1973', noOfDiscs: '1', aux: 'live', discogs: { releaseId: '7', url: '' } },
        DEFAULT_CONFIG,
      ),
    ).toEqual([
      '  Artist   Magma',
      '  Year     1973',
      '  Extra    live',
      '  Folder   Magma/1973 [live]',
      '  Discogs  r7',
    ]);
  });
});
