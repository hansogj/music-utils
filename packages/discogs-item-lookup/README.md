# Discogs Item Lookup

A CLI and library to look up information about a specific music release from the Discogs API.

## Features

- **Artist Name:** Get the credited artists for the release (`artists`), and every credit joined as Discogs shows it (`artistCredit`, when several).
- **Item Title:** Find the album or single name.
- **Tracklist:** View the complete tracklist for the specific release version, with durations and track credits. A suite listed with sub-tracks (an index entry) is one track, unless its parts carry track numbers of their own: then each part is a track, titled `Suite; part`. `trackCount` picks the reading that gives that many tracks.
- **Genres, country and personnel:** `genres`, `styles`, `country`, `extraartists`.
- **Release Years:** See both the year for this specific release and the year of the original master release.
- **Direct Link:** A convenient link to view the release directly on the Discogs website.

## Installation

```bash
npm install -g @hansogj/discogs-item-lookup
```

## CLI Usage

After installation, you can use the `discogs-lookup` command.

```bash
discogs-lookup <release-id> [options]
```

**Arguments:**

- `<release-id>`: The Discogs release ID (e.g., `249504` or `r249504`), a master ID (e.g., `m1439`, resolved to the master's main release), or a discogs.com release/master URL. `masterYear` is the original release year from the master (falls back to the release year).

**Options:**

- `-t, --token <token>`: Discogs personal access token. This overrides the `DISCOGS_TOKEN` environment variable.
- `-h, --help`: display help for command.
- `-V, --version`: output the version number.

**Example:**

```bash
discogs-lookup 249504 // or
pnpm run cli 249504
```

This will output the release information for Rick Astley's "Never Gonna Give You Up"
.

## Library Usage

You can also use this package as a library in your own Node.js projects.

```typescript
import { lookupRelease, DiscogsApiError } from '@hansogj/discogs-item-lookup';

async function getReleaseInfo() {
  try {
    const data = await lookupRelease({
      releaseId: '249504',
      // token: 'your-discogs-token', // optional, will use env if not provided
      // disc: 2, // optional, to get only a specific disc
    });
    console.log(data);
  } catch (error) {
    if (error instanceof DiscogsApiError) {
      console.error(`API Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred:', error);
    }
  }
}

getReleaseInfo();
```

`artist` (every credited artist joined with `, `) is deprecated: use `artists[0]` or `artistCredit`.

### Formatting helpers

`@hansogj/discogs-item-lookup/format` holds the pure helpers that music-utils and music-audit share, with no network or environment access:

- `cleanArtistName(name)`: drops Discogs' `(n)` suffix (`Dave Greenslade (2)` → `Dave Greenslade`).
- `joinArtistCredit(artists)`: every credited artist with Discogs' `join`s; `/` becomes `, ` (`Patrick Woodroffe, Dave Greenslade`), so the name fits a folder name.
- `flattenTracklist(tracklist, reading?)`: headings dropped; a suite (index entry) split into its parts when they carry track numbers of their own (`Suite; part`, with `suite` / `part` fields), else one track (position from the first part). `reading` `'split'` / `'joined'` forces either.
- `fitTracklist(tracklist, fits)`: Discogs' reading, or the split / joined one when only that `fits` (e.g. the number of files). `hasSuites(tracklist)` tells whether there is a choice.
- `formatInfoTxt(release, artistName, disc?)`: the `info.txt` text: `Artist - Title (year)`, reissue year, country, songs with composers and durations, personnel, then `Discogs-Release:` / `Discogs-Master:` / `Disc:` lines.

The same helpers are exported from the package root too.

## Configuration

This tool requires a Discogs Personal Access Token to communicate with the Discogs API. The token can be provided in one of two ways:

1.  **Environment Variable (recommended):** Create a `.env` file in your project root and add `DISCOGS_TOKEN=your_token_here`.
2.  **CLI Option:** Use the `--token` or `-t` flag when running the command.

### Getting a Discogs Token

1.  Log in to your Discogs account.
2.  Go to your [Developer Settings](https://www.discogs.com/settings/developers).
3.  Click "Generate new token".
4.  Use this token for the `DISCOGS_TOKEN` environment variable or the `--token` option.

...
