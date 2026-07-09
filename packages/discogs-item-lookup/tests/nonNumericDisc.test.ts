import { describe, it, expect, vi, afterEach } from 'vitest';

// Isolated test for non-numeric disc positions

describe('lookupRelease (non-numeric disc positions)', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('should treat non-numeric positions as separate discs', async () => {
    // Arrange: mock a release with positions 'A' and 'B'
    const mockRelease = {
      id: 123456,
      title: 'Test Alpha',
      artists: [{ name: 'Test Artist', id: 1 }],
      tracklist: [
        { position: 'A', title: 'Alpha', duration: '3:00', type_: 'track' },
        { position: 'B', title: 'Beta', duration: '2:30', type_: 'track' },
      ],
      master_id: 654321,
      year: 2022,
    };
    const original = await vi.importActual('../src/core/api-client');
    vi.doMock('../src/core/api-client', () => ({
      ...original,
      fetchRelease: () => Promise.resolve(mockRelease),
      fetchMaster: () =>
        Promise.resolve({
          id: 654321,
          year: 2022,
          title: 'Test Alpha',
          artists: [{ name: 'Test Artist', id: 1 }],
        }),
    }));
    const { lookupRelease } = await import('../src/index');
    const result = await lookupRelease({ releaseId: '123456' });
    expect(result.discs.length).toBe(1);
    expect(result.discs[0].tracks.length).toBe(2);
    expect(result.discs[0].tracks[0].title).toBe('Alpha');
    expect(result.discs[0].tracks[1].title).toBe('Beta');
  });
});
