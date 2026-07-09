# Discogs Cover Art Finder

A simple and powerful tool to find and download the main cover art for any album from Discogs. It can be used as a command-line tool or as a library in your own Node.js projects. Now in TypeScript!

## Setup

This project uses `pnpm` as its package manager.

1.  **Install pnpm:**
    If you don't have pnpm, you can install it globally with npm:

    ```bash
    npm install -g pnpm
    ```

2.  **Clone the repository and install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Create a `.env` file:**
    Copy the `.env.example` to a new file named `.env`.

    ```bash
    cp .env.example .env
    ```

4.  **Get a Discogs Personal Access Token:**
    - Go to your Discogs [Developer Settings](https://www.discogs.com/settings/developers).
    - Click "Generate new token".
    - Copy the generated token.

5.  **Add your token to the `.env` file:**
    Open your `.env` file and paste your token:
    ```
    DISCOGS_TOKEN=YourDiscogsTokenGoesHere
    ```
6.  **Build the project:**
    This project is written in TypeScript. You need to compile it to JavaScript before running.
    ```bash
    pnpm build
    ```

## CLI Usage

After building the project (`pnpm build`), you can run the CLI. It will interactively prompt you if multiple matches are found.

**Syntax:**

```bash
node dist/src/cli.js -artist="<Artist Name>" -title="<Album Title>" [-target="</path/to/save>"]
```

Or using the pnpm script:

```bash
pnpm cli -- -artist="<Artist Name>" -title="<Album Title>" [-target="</path/to/save>"]
```

**Arguments:**

- `-artist`: The name of the artist (required).
- `-title`: The title of the album (required).
- `-target`: The folder where `cover.jpg` will be saved. Defaults to the current directory (`.`).

**Example:**

```bash
pnpm cli -- -artist="Daft Punk" -title="Discovery" -target="./downloads"
```

If you install the package globally (`pnpm add -g .`), you can use the command directly:

```bash
discogs-cover -artist="Daft Punk" -title="Discovery"
```

## Library Usage

You can import the core function into your own Node.js projects to programmatically fetch cover art.

**Installation:**

```bash
pnpm add @hansogj/discogs-cover
```

**Using Environment Variables (`.env`)**

The `discogsMainCover` function is designed to automatically use the `DISCOGS_TOKEN` from your environment variables. To load this token from a `.env` file in your own project, you'll need the `dotenv` package.

1.  Install `dotenv`:

    ```bash
    pnpm add dotenv
    ```

2.  Load the `.env` file at the very start of your script by adding `import 'dotenv/config';`.

This setup allows you to call `discogsMainCover` without manually passing the token, as it will be picked up from `process.env`.

**Example (TypeScript):**

```typescript
import { discogsMainCover } from '@hansogj/discogs-cover';
import * as fs from 'node:fs';
import 'dotenv/config'; // Load environment variables from .env file

// --- Get the first result automatically (using async/await) ---
async function getFirstCover() {
  try {
    // No need to pass the token here, it's read from process.env.DISCOGS_TOKEN
    const imageBuffer: Buffer = await discogsMainCover({
      artist: 'Daft Punk',
      title: 'Discovery',
      strategy: 'first', // 'first' is the default
      // token: "MY_SECRET_TOKEN", // optional, will default to DISCOGS_TOKEN from `.env`
    });
    fs.writeFileSync('daft-punk-cover.jpg', imageBuffer);
    console.log('Cover saved!');
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error('An unknown error occurred', error);
    }
  }
}

getFirstCover();

// --- Prompt the user if multiple matches exist ---
async function getCoverWithPrompt() {
  try {
    const imageBuffer: Buffer = await discogsMainCover({
      artist: 'Radiohead',
      title: 'OK Computer',
      strategy: 'prompt', // Will ask user to choose from a list
    });
    fs.writeFileSync('radiohead-cover.jpg', imageBuffer);
    console.log('Cover saved!');
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error('An unknown error occurred', error);
    }
  }
}

getCoverWithPrompt();
```
