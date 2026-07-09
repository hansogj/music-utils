import { http, HttpResponse } from 'msw';
import { mockRelease, mockMaster } from './data';

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
