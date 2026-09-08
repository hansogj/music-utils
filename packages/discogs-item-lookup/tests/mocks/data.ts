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
