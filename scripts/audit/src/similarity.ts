// Dice coefficient on character bigrams — fast, no deps, handles minor spelling
// differences and punctuation variations well enough for music track titles.

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "'")           // normalize apostrophes
    .replace(/[^\w\s']/g, ' ')        // strip punctuation
    .replace(/\b(a|an|the|le|la|les|el|los|die|der|das)\b/g, ' ') // strip articles
    .replace(/\s+/g, ' ')
    .trim();
}

export function dice(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let intersection = 0;
  for (const bg of ba) if (bb.has(bg)) intersection++;
  return (2 * intersection) / (ba.size + bb.size);
}

// Score a Discogs tracklist against local track names.
// Compares positionally on min(local, discogs) tracks.
// Returns a 0–1 score where 1 = perfect match.
export function scoreTracklist(
  localNames: string[],           // parsed filename or existing TITLE tag
  discogsTitles: string[],        // from Discogs tracklist, type=track only
): number {
  const compareCount = Math.min(localNames.length, discogsTitles.length);
  if (compareCount === 0) return 0;

  let similaritySum = 0;
  for (let i = 0; i < compareCount; i++) {
    similaritySum += dice(localNames[i], discogsTitles[i]);
  }
  const avgSimilarity = similaritySum / compareCount;

  // Small penalty when Discogs has bonus tracks beyond what we have
  const extraTracks = discogsTitles.length - localNames.length;
  const bonusPenalty = extraTracks > 0 ? (extraTracks / discogsTitles.length) * 0.1 : 0;

  // Larger penalty when Discogs has fewer tracks than local (wrong pressing)
  const missingPenalty = discogsTitles.length < localNames.length ? 0.3 : 0;

  return Math.max(0, avgSimilarity * (1 - bonusPenalty) - missingPenalty);
}
