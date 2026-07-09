#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
// Fix: Import 'process' from 'node:process' to provide types for process.argv and process.exit.
import * as process from 'node:process';
import { discogsMainCover } from './main';

dotenv.config();

// --- CLI Logic ---
async function runCli() {
  try {
    const args = process.argv.slice(2).reduce(
      (acc, arg) => {
        const [key, value] = arg.split('=');
        if (key && value) {
          acc[key.replace(/^-+/, '')] = value.replace(/"/g, '');
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    const { artist, title, releaseId, target = '.' } = args;

    if (!releaseId && (!artist || !title)) {
      console.error(
        'Usage: discogs-cover [-artist="<Artist Name>" -title="<Album Title>"] | [-releaseId="<ID>"] [-target="</path/to/save>"]',
      );
      process.exit(1);
    }

    if (releaseId) {
      console.log(`Searching for release ID "${releaseId}"...`);
    } else {
      console.log(`Searching for "${artist} - ${title}"...`);
    }

    const imageBuffer = await discogsMainCover({
      artist,
      title,
      releaseId,
      strategy: 'prompt',
    });

    const targetPath = path.resolve(target);
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    const filePath = path.join(targetPath, 'cover.jpg');
    fs.writeFileSync(filePath, imageBuffer);

    console.log(`Cover art successfully saved to ${filePath}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unknown error occurred', error);
    }
    process.exit(1);
  }
}

runCli();
