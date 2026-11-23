import { fitTracklist } from '@hansogj/discogs-item-lookup/format';
import chalk from 'chalk';

import { sortArtist } from '../articles.js';
import { matchNames } from '../checks/names.js';
import {
  expectedFirstTrack,
  type SiblingDisc,
  siblingDiscs,
  siblingReleaseId,
  siblingWithRelease,
} from '../disc-siblings.js';
import { describeSlice, type DiscSlice, type DiscSliceContext, sliceForDisc, windowAt } from '../disc-split.js';
import { fetchRelease, fitsFolder, numberTracklist, pickMasterVersion, resolveReleaseId } from '../discogs.js';
import { writeInfoTxt } from '../info-txt.js';
import { interactive } from '../rate-limit.js';
import { type AlbumAudit } from '../types.js';
import {
  albumMetaFromLayout,
  askFolderRename,
  askSetAux,
  chooseArtist,
  musicFilesIn,
  planFolderRename,
  splitArtistBrackets,
} from './folder.js';
import { ask, BackSignal } from './prompt.js';
import { parseReleaseRef, pickRelease } from './release-picker.js';
import { offerFileRenames, tagFromTracklist } from './tagging.js';

// The Discogs tagging action: release choice, disc slice, tag write, info.txt, renames.

export interface RepairAction {
  label: string;
  // May return what was done, for the repair log, when it differs from the label.
  run: () => Promise<string | void>;
  discogs?: boolean; // the Discogs release tagging action
}

interface SuggestedRelease {
  id: string;
  source: string;
}

// The release the album is already tagged with, when every tagged track agrees.
export function taggedReleaseId(audit: AlbumAudit): SuggestedRelease | undefined {
  const ids = new Set(audit.tracks.map((t) => t.tags.discogsReleaseId?.trim()).filter(Boolean));
  return ids.size === 1 ? { id: [...ids][0] as string, source: 'tags' } : undefined;
}

export async function discogsActionFor(
  audit: AlbumAudit,
  token: string,
  suggested?: SuggestedRelease,
): Promise<RepairAction> {
  const meta = albumMetaFromLayout(audit.layout);
  const files = await musicFilesIn(audit.layout.albumPath);
  const siblings = await siblingDiscs(audit.layout);
  return buildDiscogsAction(audit, token, meta, files, siblings, suggested);
}

// Which part of the release this folder is: all of it, or one disc of a split album.
// Asks when the release gives no disc split and the place can't be confirmed by titles.
async function chooseDiscSlice(
  numbered: ReturnType<typeof numberTracklist>,
  ctx: DiscSliceContext & { localTotal?: number },
): Promise<DiscSlice | undefined> {
  let slice = sliceForDisc(numbered, ctx);
  if (slice.method === 'whole') return slice;
  const disc = `Disc ${ctx.disc}∕${ctx.noOfDiscs}`;
  const show = () => {
    const score = slice.score !== undefined ? `, ${Math.round(slice.score * 100)}% title match` : '';
    const how = slice.method === 'positions' ? '' : slice.method === 'titles' ? ' — placed by titles' : '';
    console.log(chalk.cyan(`  ${disc} → release ${describeSlice(slice)}${score}${how}`));
    // Placed by position, not by the release's own disc numbering: show the pairing.
    if (slice.method !== 'positions') {
      slice.tracks.forEach((t, i) =>
        console.log(
          chalk.dim(
            `    ${String(i + 1).padStart(2, '0')} ${ctx.localNames[i] || '?'}  →  ${t.position ? `${t.position} ` : ''}${t.title}`,
          ),
        ),
      );
    }
  };
  if (slice.method === 'positions') {
    show();
    return slice;
  }
  if (ctx.localTotal !== undefined && ctx.localTotal !== slice.total) {
    console.log(
      chalk.yellow(
        `  ⚠ The release has ${slice.total} tracks, your ${ctx.noOfDiscs} disc folders ${ctx.localTotal}: it may split the songs differently`,
      ),
    );
  }
  if (slice.method === 'unknown') {
    console.log(
      chalk.yellow(
        `  ⚠ The release has no disc split, and neither the titles nor the other disc folders tell where ${disc} starts.`,
      ),
    );
  } else {
    show();
  }
  while (true) {
    const again =
      slice.method === 'unknown'
        ? 'n'
        : (await ask('  [Enter] OK   [n] Start at another track: ')).trim().toLowerCase();
    if (again !== 'n') return slice;
    const n = parseInt(await ask(`  ${disc} starts at release track (1–${slice.total}): `), 10);
    if (!(n >= 1 && n <= slice.total)) {
      if (slice.method === 'unknown') return undefined;
      continue;
    }
    slice = windowAt(numbered, n - 1, ctx);
    show();
  }
}

function buildDiscogsAction(
  audit: AlbumAudit,
  token: string,
  meta: ReturnType<typeof albumMetaFromLayout>,
  files: { name: string; ext: 'flac' | 'mp3' }[],
  siblings: SiblingDisc[],
  suggestedRelease?: SuggestedRelease,
): RepairAction {
  // A release the album is known to be (tags, comment, info.txt) beats a search hit:
  // a search can only find editions by title, not the one with these bonus tracks.
  // For a split album, the release the other disc folders were tagged from.
  const fromSiblings = siblingReleaseId(siblings);
  const suggested =
    suggestedRelease ??
    taggedReleaseId(audit) ??
    (fromSiblings ? { id: fromSiblings, source: 'the other disc folder' } : undefined);
  const folderDisc = parseInt(meta.discNumber, 10);
  const noOfDiscs = parseInt(meta.noOfDiscs, 10);
  const topResult = audit.discogsResults?.[0];
  const label = suggested
    ? `Tag from Discogs release ID (suggested: ${suggested.id}, from ${suggested.source})`
    : topResult
      ? `Tag from Discogs release ID (suggested: ${topResult.id} — ${topResult.title}${
          topResult.format?.[0] ? `, ${topResult.format[0]}` : ''
        }${topResult.owned ? ', in collection' : ''}${topResult.matchScore !== undefined ? `, ${Math.round(topResult.matchScore * 100)}% match` : ''})`
      : 'Tag from Discogs release ID';

  return {
    label,
    discogs: true,
    // interactive(): its Discogs requests go ahead of the background scan's.
    run: () =>
      interactive(async () => {
        const results = audit.discogsResults ?? [];
        // Another disc folder of the set was tagged already: its release first, then its brackets.
        const fromDisc = siblingWithRelease(siblings);
        const sameAsDisc =
          !!fromDisc &&
          (await ask(`    Use the same release ID [r${fromDisc.releaseId}] as Disc ${fromDisc.disc}? [Y/n] `))
            .trim()
            .toLowerCase() !== 'n';
        if (fromDisc && sameAsDisc) {
          const aux = await askSetAux(audit.layout, fromDisc);
          if (aux !== undefined && aux !== 'same') planFolderRename(audit.layout, { aux });
        }
        // After a no, the other disc's release isn't suggested again.
        const declined = fromDisc && !sameAsDisc ? fromDisc.releaseId : undefined;
        const ownId = suggested?.id !== declined ? suggested?.id : undefined;
        const topId = ownId ?? (topResult ? String(topResult.id) : '');

        // Retry loop: re-prompt if the fetch fails (e.g. Discogs 500, bad ID).
        let release: Awaited<ReturnType<typeof fetchRelease>> | undefined;
        let releaseId = sameAsDisc ? fromDisc!.releaseId! : '';
        let prompt = !sameAsDisc;
        while (!release) {
          if (!prompt) prompt = true;
          else {
            const browseHint = results.length > 0 ? '  (b to browse list)' : '';
            const input = (await ask(`    Release ID [${releaseId || topId || 'enter ID'}]${browseHint}: `)).trim();

            if (input === 'b' && results.length > 0) {
              const picked = await pickRelease(results);
              if (picked === null) throw new BackSignal(); // Esc → back to action menu
              // undefined: the "enter different ID" row (or no TTY for the list) → ask again
              if (picked === undefined) continue;
              releaseId = picked;
            } else if (input) {
              const ref = parseReleaseRef(input);
              releaseId = ref?.id ?? '';
              if (ref?.type === 'master') {
                try {
                  if (noOfDiscs > 1) {
                    const picked = await pickMasterVersion(ref.id, token, {
                      disc: folderDisc,
                      noOfDiscs,
                      localCount: files.length,
                    });
                    releaseId = picked.releaseId;
                    console.log(chalk.dim(`  Master m${ref.id} → release r${releaseId} (${picked.why})`));
                  } else {
                    releaseId = await resolveReleaseId(ref, token);
                    console.log(chalk.dim(`  Master m${ref.id} → main release r${releaseId}`));
                  }
                } catch (err) {
                  console.log(chalk.red(`  ✗ ${err instanceof Error ? err.message : String(err)}`));
                  releaseId = '';
                  continue;
                }
              }
            } else if (!releaseId) {
              releaseId = topId; // Enter with no input → use suggested ID
            }
            // Enter with existing releaseId (retry after error) → keep it
          }

          if (!releaseId) {
            console.log(chalk.yellow('  Skipped — no release ID'));
            return;
          }

          console.log(chalk.dim(`  Fetching release ${releaseId}...`));
          try {
            release = await fetchRelease(releaseId, token);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(chalk.red(`  ✗ ${msg}`));
            const retry = await ask('  Try a different release ID? [y/N] ');
            if (retry.toLowerCase() !== 'y') return;
            releaseId = ''; // clear so prompt shows fresh
          }
        }

        // Suites as one track or several, as fits the folder's files (Dice's "War; a) Ouverture").
        const tracklist = fitTracklist(
          release.rawTracklist ?? release.tracklist,
          fitsFolder(audit.layout.albumFolder, files.length),
        );
        if (tracklist.length === 0) {
          console.log(chalk.yellow('  No tracks found on this release'));
          return;
        }

        // Always the original (master) year and title — a 1989 reissue of a 1970 album is tagged 1970.
        const year = release.year ?? meta.year;
        const album = release.title?.trim() || meta.album;
        if (release.year && release.releaseYear && release.releaseYear !== release.year)
          console.log(
            chalk.dim(
              `  Year: ${release.year} (original, master m${release.masterId}) — this release ${release.releaseYear}`,
            ),
          );
        const genreValue = [...(release.genres ?? []), ...(release.styles ?? [])].slice(0, 4).join(', ');
        const releaseUrl = `https://www.discogs.com/release/${releaseId}`;

        // For a "(Disc n∕m)" folder only that disc's part of the release is used.
        const names = new Map(matchNames(audit.tracks).map((n, i) => [audit.tracks[i].fileName, n]));
        const slice = await chooseDiscSlice(numberTracklist(tracklist), {
          disc: folderDisc,
          noOfDiscs,
          localNames: files.map((f) => names.get(f.name) ?? ''),
          localCount: files.length,
          expectedFirst: expectedFirstTrack(folderDisc, siblings),
          // All disc folders present: their tracks together, to compare with the release.
          localTotal:
            siblings.length === noOfDiscs - 1 ? siblings.reduce((n, s) => n + s.trackCount, files.length) : undefined,
        });
        if (!slice) {
          console.log(chalk.dim('  Skipped.'));
          return;
        }
        const discTracks = slice.tracks;
        const artist = await chooseArtist(audit.layout, audit.tracks, release);
        // Tags and info.txt get the folder's brackets too ("Dionysos [Canada]"): same-named
        // artists stay apart in a player, as they do in the folders.
        const fullArtist = `${artist}${splitArtistBrackets(audit.layout.artistName).brackets}`;
        const tagged = await tagFromTracklist(audit, files, names, discTracks, {
          folderDisc,
          countWarning: (extra) => {
            const what = slice.method === 'whole' ? 'Discogs has' : `Disc ${folderDisc} on Discogs has`;
            return extra > 0
              ? `${what} ${extra} more track(s) — may be a bonus edition`
              : `${what} ${-extra} fewer track(s) — may be a different pressing`;
          },
          tags: ({ no, disc, total, title }) => ({
            // As music-utils tags it: "Beatles, The" with artist.sortArticles on.
            ARTIST: sortArtist(fullArtist),
            ALBUMARTIST: sortArtist(fullArtist),
            ALBUM: album,
            TRACKNUMBER: `${no}/${total}`,
            DISCNUMBER: `${disc}/${meta.noOfDiscs}`,
            ...(year ? { DATE: year, ORIGINALDATE: year } : {}),
            ...(title ? { TITLE: title } : {}),
            ...(genreValue ? { GENRE: genreValue } : {}),
            COMMENT: releaseUrl,
            DISCOGS_RELEASE_ID: releaseId,
            // Same across pressings (FLAC rip vs mp3 copy); empty clears a stale one.
            DISCOGS_MASTER_ID: release.masterId ? String(release.masterId) : '',
          }),
        });
        if (!tagged) return;
        // ── write info.txt ─────────────────────────────────────────────────
        try {
          const written = await writeInfoTxt(audit.layout.albumPath, { ...release, tracklist }, fullArtist, {
            discNumber: meta.discNumber,
            noOfDiscs: meta.noOfDiscs,
          });
          console.log(chalk.dim(written ? '  ✓ info.txt written' : '  ✓ info.txt unchanged'));
        } catch {
          // Non-fatal — tag write already succeeded
        }

        await offerFileRenames(audit.layout.albumPath, files, tagged, 'Discogs titles');

        // ── ask about folder renames; they run after the album's other fixes ─
        const plan = await askFolderRename(audit.layout, meta, release, artist);
        if (plan) {
          planFolderRename(audit.layout, plan);
          console.log(chalk.dim("  → folder rename runs after this album's other fixes"));
        }
        return `Tagged from Discogs release ${releaseId}`;
      }),
  };
}
