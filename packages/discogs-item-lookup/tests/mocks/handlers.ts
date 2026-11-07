import { http, HttpResponse } from 'msw';
import {
  mockMaster,
  mockRelease,
  mockReleaseWithNumberedArtist,
  mockReissue,
  mockReissueMaster,
  mockTwoDiscRelease,
} from './data';

const API_BASE_URL = 'https://api.discogs.com';

export const handlers = [
  // Handler for successful release lookup
  http.get(`${API_BASE_URL}/releases/249504`, () => {
    return HttpResponse.json(mockRelease);
  }),

  // Handler for successful master lookup
  http.get(`${API_BASE_URL}/masters/3369`, () => {
    return HttpResponse.json(mockMaster);
  }),

  // Handler for release without master
  http.get(`${API_BASE_URL}/releases/12345`, () => {
    const releaseWithoutMaster = {
      ...mockRelease,
      master_id: null,
      id: 12345,
      year: 2005,
    };
    return HttpResponse.json(releaseWithoutMaster);
  }),

  // Handler for release with numbered artist suffix, e.g. "Area (6)"
  http.get(`${API_BASE_URL}/releases/1961624`, () => {
    return HttpResponse.json(mockReleaseWithNumberedArtist);
  }),

  // Handler for a 2-disc release
  http.get(`${API_BASE_URL}/releases/2000001`, () => {
    return HttpResponse.json(mockTwoDiscRelease);
  }),

  // Reissue (1989) of a 1970 master
  http.get(`${API_BASE_URL}/releases/3422683`, () => {
    return HttpResponse.json(mockReissue);
  }),
  http.get(`${API_BASE_URL}/masters/1439`, () => {
    return HttpResponse.json(mockReissueMaster);
  }),

  // Release whose master has an unknown year (Discogs reports 0)
  http.get(`${API_BASE_URL}/releases/4000001`, () => {
    return HttpResponse.json({ ...mockRelease, id: 4000001, year: 1995, master_id: 4001 });
  }),
  http.get(`${API_BASE_URL}/masters/4001`, () => {
    return HttpResponse.json({ ...mockMaster, id: 4001, year: 0, main_release: 4000001 });
  }),

  // Handler for a not found error
  http.get(`${API_BASE_URL}/releases/999999`, () => {
    return new HttpResponse(JSON.stringify({ message: 'Release not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }),

  // Handler for a master fetch failure
  http.get(`${API_BASE_URL}/masters/9999`, () => {
    return new HttpResponse(JSON.stringify({ message: 'Master not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
];
