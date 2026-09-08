import type { Issue, TrackInfo } from '../types.js';

// Qualifiers that mark a track as a legitimate variant — not a true duplicate
const VARIANT_RE =
  /\b(live|alternate|alternative|alt\.?|acoustic|demo|rehearsal|reprise|remix|radio|edit|extended|instrumental|mono|stereo|remaster(?:ed)?|part\s+[1-9ivx]+|pt\.?\s+[1-9ivx]+|version|take\s+\d+)\b/i;

function baseName(raw: string): string {
  // Strip parenthetical and bracketed qualifiers, then normalize
  return raw
    .replace(/\s*[\[(][^\])\n]*[\])]?\s*/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVariant(raw: string): boolean {
  const parentheticals = raw.match(/[\[(][^\])\n]*[\])]?/g) ?? [];
  return parentheticals.some((p) => VARIANT_RE.test(p));
}

export function checkDuplicates(tracks: TrackInfo[]): Issue[] {
  const byBase = new Map<string, TrackInfo[]>();

  for (const track of tracks) {
    const name = (track.tags.title ?? track.parsedName ?? '').trim();
    if (!name) continue;
    const key = baseName(name);
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key)!.push(track);
  }

  const issues: Issue[] = [];

  for (const [, group] of byBase) {
    if (group.length < 2) continue;
    // Only flag groups where multiple entries are not variants
    const trueDupes = group.filter((t) => !isVariant(t.tags.title ?? t.parsedName ?? ''));
    if (trueDupes.length < 2) continue;

    const displayName = trueDupes[0].tags.title ?? trueDupes[0].parsedName ?? '(unknown)';
    const files = trueDupes.map((t) => t.fileName).join(', ');
    issues.push({
      severity: 'MODERATE',
      code: 'DUPLICATE_TRACKS',
      message: `Duplicate track name "${displayName}" appears ${trueDupes.length}×: ${files}`,
      suggestion: `Verify these are not live/alternate-take variants; remove or annotate the extra copy`,
    });
  }

  return issues;
}
