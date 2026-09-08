import type { DiscogsSearchResult } from './types.js';

const API = 'https://api.discogs.com';
const UA = 'MusicLibraryAudit/1.0 +https://github.com/hansogj/music-utils';

interface RawResult {
  id: number;
  title: string;
  year?: string;
  master_id?: number;
  genre?: string[];
  style?: string[];
}

interface SearchResponse {
  results?: RawResult[];
}

function cleanAlbumTitle(folderName: string): string {
  return folderName
    .replace(/^\d{4}\s+/, '')              // strip leading year
    .replace(/\s*\([^)]+\)\s*/g, ' ')     // strip parentheticals (Disc N/M)
    .replace(/\s*\[[^\]]+\]\s*/g, ' ')    // strip aux brackets
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchDiscogs(
  artist: string,
  albumFolder: string,
  token: string,
  limit = 5,
): Promise<DiscogsSearchResult[]> {
  const title = cleanAlbumTitle(albumFolder);

  const url = new URL(`${API}/database/search`);
  url.searchParams.set('type', 'release');
  url.searchParams.set('artist', artist);
  url.searchParams.set('release_title', title);
  url.searchParams.set('per_page', String(limit));

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': UA, Authorization: `Discogs token=${token}` },
  });

  if (!res.ok) {
    throw new Error(`Discogs ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as SearchResponse;

  return (data.results ?? []).slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year,
    masterId: r.master_id,
    releaseUrl: `https://www.discogs.com/release/${r.id}`,
    masterUrl: r.master_id ? `https://www.discogs.com/master/${r.master_id}` : undefined,
    genre: r.genre,
    style: r.style,
  }));
}
