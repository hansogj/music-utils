import { describe, expect, it } from 'vitest';

import type { NumberedTrack } from './discogs.js';
import { checkRenames, pairingProblem, pairWithRelease, sanitizeFilename } from './rename-plan.js';

describe('sanitizeFilename', () => {
  it('turns a slash or colon inside a title into " - "', () => {
    expect(sanitizeFilename('Opening/Siberian Khatru')).toBe('Opening - Siberian Khatru');
    expect(sanitizeFilename('A) Future Times / B) Rejoice')).toBe('A) Future Times - B) Rejoice');
    expect(sanitizeFilename('Title: Part 2')).toBe('Title - Part 2');
  });

  it('drops the other characters a file name cannot hold', () => {
    expect(sanitizeFilename('What? "Now" <x>|')).toBe('What Now x');
  });
});

const track = (disc: number, no: number, title: string): NumberedTrack => ({
  disc,
  no,
  title,
  position: `${disc}-${no}`,
});

describe('pairWithRelease', () => {
  const release = [track(1, 1, 'A'), track(1, 2, 'B'), track(2, 1, 'C'), track(2, 2, 'D')];

  it('pairs by disc and number when every file finds a track', () => {
    expect(
      pairWithRelease(
        [
          { disc: 2, no: 1 },
          { disc: 1, no: 2 },
        ],
        release,
      ).map((t) => t?.title),
    ).toEqual(['C', 'B']);
  });

  it('a single folder of a 2-CD release: local track 3 is CD 2 track 1', () => {
    const local = [1, 2, 3, 4].map((no) => ({ disc: 1, no }));
    expect(pairWithRelease(local, release).map((t) => t?.title)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('pairs by order, sorted by number, and leaves extra files unpaired', () => {
    const local = [3, 1, 2, 5, 4].map((no) => ({ disc: 1, no }));
    expect(pairWithRelease(local, release).map((t) => t?.title)).toEqual(['C', 'A', 'B', undefined, 'D']);
  });
});

describe('pairingProblem', () => {
  it('flags titles several files would share', () => {
    expect(pairingProblem(['A', 'A', 'B'])).toMatch(/2 files would get a title another file also gets/);
  });

  it('flags most files without a title', () => {
    expect(pairingProblem(['A', undefined, undefined])).toMatch(/2 of 3 files match no release track/);
  });

  it('is fine with distinct titles and a few gaps', () => {
    expect(pairingProblem(['A', 'B', undefined])).toBeUndefined();
  });
});

describe('checkRenames', () => {
  it('passes renames to free names', () => {
    const r = [{ old: 'x.mp3', new: '01 - A.mp3' }];
    expect(checkRenames(r, ['x.mp3'])).toEqual({ ok: r });
  });

  it('offers none when two files would get one name', () => {
    const r = [
      { old: 'x.mp3', new: '01 - A.mp3' },
      { old: 'y.mp3', new: '01 - A.mp3' },
      { old: 'z.mp3', new: '02 - B.mp3' },
    ];
    expect(checkRenames(r, ['x.mp3', 'y.mp3', 'z.mp3'])).toEqual({ ok: [], clash: ['01 - A.mp3'] });
  });

  it('offers none when a new name is a file already there, in any case', () => {
    const r = [{ old: 'x.mp3', new: '01 - A.mp3' }];
    expect(checkRenames(r, ['x.mp3', '01 - a.mp3'])).toEqual({ ok: [], clash: ['01 - A.mp3'] });
  });

  it('allows a rename that only changes case', () => {
    const r = [{ old: '01 - a.mp3', new: '01 - A.mp3' }];
    expect(checkRenames(r, ['01 - a.mp3'])).toEqual({ ok: r });
  });
});
