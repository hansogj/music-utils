const DISCOGS_API_URL = 'https://api.discogs.com';
const USER_AGENT = 'DiscogsCover/1.2.0';

export async function fetchDiscogs<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Authorization: `Discogs token=${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Discogs API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export { DISCOGS_API_URL };
