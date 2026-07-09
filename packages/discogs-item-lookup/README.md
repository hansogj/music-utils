# Discogs Item Lookup

A CLI and library to look up information about a specific music release from the Discogs API.

## Features

- **Artist Name:** Get the primary artist(s) for the release.
- **Item Title:** Find the album or single name.
- **Tracklist:** View the complete tracklist for the specific release version.
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

- `<release-id>`: The numeric ID of the Discogs release (e.g., `249504`).

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
