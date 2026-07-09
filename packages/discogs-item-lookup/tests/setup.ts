import './mocks/mock-localstorage'; // Ensure basic localStorage polyfill is available early
import { beforeAll, afterEach, afterAll, vi } from 'vitest';

// Provide a dummy Discogs token for tests where getToken() is called but the
// API layer is mocked. Real requests never reach the network here.
process.env.DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || 'test-token';

// Re-mock localStorage with vi.fn() for test assertions and tracking
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  },
  writable: true,
});

import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
