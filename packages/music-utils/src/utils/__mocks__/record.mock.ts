import { Release, Track } from '../../types';

export const release: Partial<Release> = {
  artist: 'Magma',
  album: 'MDK',
  year: '1973',
};

export const track: Partial<Track> = {
  ...release,
  ...{
    trackName: 'Tusen Takk',
    trackNo: '01',
  },
};

export const albumTrack: Partial<Track> = {
  ...track,

  ...{ discNumber: '02', noOfDiscs: '04', trackNoTotal: '12' },
};

export const mdkls = [
  'folder.jpg',
  '01 - Hortz Fur Dehn Stekehn West.mp3',
  '04 - Da Zeuhl Wortz Mekanik.mp3',
  '07 - Kreuhn Kohrmahn Iss De Hundin.mp3',
  '02 - Ima Suri Dondai.mp3',
  '05 - Nebehr Gudahtt.mp3',
  '03 - Kobaia Is De Hundin.mp3',
  '06 - Mekanik Kommandoh.mp3',
];
