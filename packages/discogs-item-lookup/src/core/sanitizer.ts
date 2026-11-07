export interface DiscogsId {
  type: 'release' | 'master';
  id: string;
}

/**
 * Parses a Discogs release or master reference from user input.
 * Accepts `249504`, `r249504`, `[r249504]`, `m1439`, `[m1439]` and discogs.com
 * release/master URLs. Bare numbers are release IDs.
 * @returns The parsed reference, or undefined when the input is not recognised.
 */
export function parseDiscogsId(input: string): DiscogsId | undefined {
  const s = input.trim();
  const url = s.match(/discogs\.com\/(?:[^/]+\/)*(release|master)\/(\d+)/i);
  if (url) return { type: url[1].toLowerCase() as DiscogsId['type'], id: url[2] };
  const ref = s.match(/^\[?\s*([rm]?)(\d+)\s*\]?$/i);
  if (ref) return { type: ref[1].toLowerCase() === 'm' ? 'master' : 'release', id: ref[2] };
  return undefined;
}
