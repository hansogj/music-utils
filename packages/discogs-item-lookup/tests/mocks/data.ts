import { DiscogsReleaseResponse, DiscogsMasterResponse } from '../../src/types';

export const mockRelease: DiscogsReleaseResponse = {
  id: 249504,
  status: 'Accepted',
  year: 2000,
  resource_url: 'https://api.discogs.com/releases/249504',
  uri: 'https://www.discogs.com/release/249504',
  artists: [
    {
      name: 'Daft Punk',
      anv: '',
      join: '',
      role: '',
      tracks: '',
      id: 1283,
      resource_url: 'https://api.discogs.com/artists/1283',
    },
  ],
  artists_sort: 'Daft Punk',
  labels: [],
  series: [],
  companies: [],
  formats: [],
  data_quality: 'Accepted',
  community: {
    have: 0,
    want: 0,
    rating: { count: 0, average: 0 },
    submitter: { username: 'test', resource_url: '' },
    contributors: [],
    data_quality: 'Accepted',
    status: 'Accepted',
  },
  num_for_sale: 0,
  lowest_price: 0,
  master_id: 3369,
  master_url: 'https://api.discogs.com/masters/3369',
  title: 'One More Time',
  country: 'France',
  released: '2000',
  notes: '',
  released_formatted: '2000',
  identifiers: [],
  videos: [],
  tracklist: [
    {
      position: '1',
      title: 'One More Time (Short Radio Edit)',
      type_: 'track',
      duration: '3:55',
    },
    {
      position: '2',
      title: 'One More Time (Club Mix)',
      type_: 'track',
      duration: '8:00',
    },
  ],
};

export const mockReleaseWithNumberedArtist: DiscogsReleaseResponse = {
  ...mockRelease,
  id: 1961624,
  master_id: 0,
  title: 'Maledetti',
  artists: [
    {
      name: 'Area (6)',
      anv: '',
      join: '',
      role: '',
      tracks: '',
      id: 99001,
      resource_url: 'https://api.discogs.com/artists/99001',
    },
  ],
  tracklist: [
    { position: '1', title: 'Cometa Rossa', type_: 'track', duration: '4:00' },
    { position: '2', title: 'Gioia e Rivoluzione', type_: 'track', duration: '3:30' },
  ],
};

export const mockTwoDiscRelease: DiscogsReleaseResponse = {
  ...mockRelease,
  id: 2000001,
  master_id: 0,
  title: 'Private Parts & Pieces',
  artists: [
    {
      name: 'Antony Phillips',
      anv: '',
      join: '',
      role: '',
      tracks: '',
      id: 99002,
      resource_url: 'https://api.discogs.com/artists/99002',
    },
  ],
  tracklist: [
    { position: '1-1', title: 'Side A Track 1', type_: 'track', duration: '4:00' },
    { position: '1-2', title: 'Side A Track 2', type_: 'track', duration: '3:30' },
    { position: '2-1', title: 'Side B Track 1', type_: 'track', duration: '5:00' },
    { position: '2-2', title: 'Side B Track 2', type_: 'track', duration: '4:15' },
  ],
};

export const mockMaster: DiscogsMasterResponse = {
  id: 3369,
  year: 2000,
  main_release: 249504,
  title: 'One More Time',
  artists: [
    {
      name: 'Daft Punk',
      id: 1283,
      anv: '',
      join: '',
      role: '',
      tracks: '',
      resource_url: 'https://api.discogs.com/artists/1283',
    },
  ],
  data_quality: 'Accepted',
  genres: ['Electronic'],
  images: [],
};

// A 1989 reissue whose master (the original album) is from 1970.
export const mockReissue: DiscogsReleaseResponse = {
  ...mockRelease,
  id: 3422683,
  title: 'In Rock',
  year: 1989,
  master_id: 1439,
};

export const mockReissueMaster: DiscogsMasterResponse = {
  ...mockMaster,
  id: 1439,
  year: 1970,
  title: 'Deep Purple In Rock',
  main_release: 3422683,
};

// Two credited artists joined with "/", a suite listed as an index entry with sub-tracks,
// a heading, track and release credits (shapes as in releases 4508999 and Yessongs).
export const mockCreditsRelease: DiscogsReleaseResponse = {
  ...mockRelease,
  id: 5000001,
  master_id: 0,
  year: 1979,
  title: 'The Pentateuch',
  country: 'UK',
  genres: ['Rock', 'Electronic'],
  styles: ['Prog Rock'],
  artists: [
    { name: 'Patrick Woodroffe', id: 1, join: '/' },
    { name: 'Dave Greenslade (2)', id: 2, join: '' },
  ],
  extraartists: [{ name: 'Rod Argent (2)', role: 'Keyboards' }],
  tracklist: [
    { position: '', title: 'Part One', type_: 'heading' },
    {
      position: '1',
      title: 'Moondance',
      type_: 'track',
      duration: '4:10',
      extraartists: [{ name: 'Dave Greenslade (2)', role: 'Written-By' }],
    },
    {
      position: '',
      title: 'And You And I',
      type_: 'index',
      duration: '10:09',
      sub_tracks: [
        { position: '2.a', title: 'Cord Of Life', type_: 'track' },
        { position: '2.b', title: 'Eclipse', type_: 'track' },
      ],
    },
    { position: '3', title: 'Coda', type_: 'track', duration: '2:00' },
  ],
};
