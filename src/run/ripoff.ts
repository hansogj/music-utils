#!/usr/bin/env node
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */

// This is a TypeScript example script demonstrating how to use the 'discogs-lookup' library.
// It can be run directly using `ts-node` or compiled to JavaScript first.

// Node.js built-in modules
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path, { join } from 'node:path';
import { chdir, exit } from 'node:process';

// Third-party modules
import { DiscogsApiError, lookupRelease, LookupReleaseOptions, LookupResult } from '@hansogj/discogs-item-lookup';
import * as dotenv from 'dotenv';

import { DISC_NO_SPLIT } from '../constants';
import { getCommandLineArgs } from '../utils/cmd.options';

// --- Core Helper Functions ---

/**
 * A helper function to run shell commands and wait for them to complete.
 * It streams the command's output directly to the console.
 * @param command The command to execute (e.g., 'ls').
 * @param args An array of arguments for the command (e.g., ['-l']).
 * @returns A promise that resolves when the command finishes successfully.
 */
function runCommand(command: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️  Running command: ${command} ${args.join(' ')}`);

    // Spawn the child process. 'inherit' connects the child's stdio to the parent's.
    const child = spawn(command, args, { stdio: 'inherit' });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        console.log(`✅ Command finished successfully.`);
        resolve();
      } else {
        // The command failed.
        reject(new Error(`Command "${command}" exited with error code ${code}`));
      }
    });

    child.on('error', (err: Error) => {
      // Failed to start the command (e.g., command not found).
      reject(new Error(`Failed to start command "${command}": ${err.message}`));
    });
  });
}

function runCommandWithOutput(command: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️  Running command: ${command} ${args.join(' ')}`);
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command "${command}" exited with error code ${code}\n${stderr}`));
      }
    });

    child.on('error', (err: Error) => {
      reject(new Error(`Failed to start command "${command}": ${err.message}`));
    });
  });
}

/**
 * Replaces characters that are invalid in Windows/macOS/Linux file paths.
 * @param input The string to sanitize.
 * @returns A sanitized string safe for use as a file or folder name.
 */
function sanitizePath(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

/**
 * Sorts and formats the tracklist for the tracks.txt file.
 * @param tracks The tracklist array from the Discogs response.
 * @returns A formatted string of track titles, separated by newlines.
 */
function formatTracklist(tracks: { position: string; title: string }[]): string {
  return tracks
    .slice()
    .sort((t1, t2) => {
      const n1 = parseInt(String(t1.position), 10);
      const n2 = parseInt(String(t2.position), 10);
      if (!Number.isNaN(n1) && !Number.isNaN(n2)) return n1 - n2;
      if (!Number.isNaN(n1)) return -1;
      if (!Number.isNaN(n2)) return 1;
      return String(t1.position).localeCompare(String(t2.position), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    })
    .map(({ title }) => title.trim())
    .join('\n');
}

// --- Audio Processing Functions ---

/**
 * Converts WAV files in the current directory to FLAC format using the 'flac' CLI tool.
 */
async function convertWavFilesToFlac(): Promise<void> {
  console.log('\n💿 Converting .wav to .flac...');
  const wavFiles = (await readdir('.')).filter((f) => f.endsWith('.wav'));

  if (wavFiles.length === 0) {
    console.log('   No .wav files found to convert.');
    return;
  }

  for (const wavFile of wavFiles) {
    try {
      const output = await runCommandWithOutput('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        wavFile,
      ]);
      const streamsData = JSON.parse(output);
      const duration = parseFloat(streamsData.streams[0]?.duration || '0');

      if (duration < 1.0) {
        console.log(`🗑️  Removing pre-gap or empty file (duration: ${duration}s): ${wavFile}`);
        await rm(wavFile);
      } else {
        await runCommand('flac', ['--keep-foreign-metadata', wavFile]);
      }
    } catch (error) {
      console.error(`Error processing ${wavFile}:`, error);
      // Decide if you want to stop or continue. For now, let's continue.
      console.log(`Skipping ${wavFile} due to error.`);
    }
  }

  console.log('✅ Conversion to .flac complete.');
}

// --- Main Orchestration ---

/**
 * Main function to orchestrate the album lookup and ripping process.
 */
async function main({ releaseId, disc }: Pick<LookupReleaseOptions, 'disc' | 'releaseId'>): Promise<void> {
  const initialDir = process.cwd();
  dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });

  try {
    console.log(`🔍 Looking up Discogs release ID: ${releaseId}...`);
    const releaseData: LookupResult = await lookupRelease({ releaseId, disc, token: process.env.DISCOGS_TOKEN });
    console.log(`💿 Found: ${releaseData.artist} - ${releaseData.title}`);
    const safeArtist = sanitizePath(releaseData.artist);
    const safeTitle = sanitizePath(releaseData.title);
    const folderName = `${releaseData.masterYear} ${safeTitle}${disc ? ` (Disc ${disc}${DISC_NO_SPLIT}${disc})` : ''}`;
    const fullPath = join(safeArtist, folderName);

    console.log(`\n📁 Creating directory: ${fullPath}`);
    await mkdir(fullPath, { recursive: true });

    const tracksContent = releaseData.discs.flatMap((releaseDisc) => formatTracklist(releaseDisc.tracks));
    const tracksFilePath = 'tracks.txt';
    console.log(`📝 Writing tracklist to: ${path.resolve(tracksFilePath)}`);
    await writeFile(tracksFilePath, tracksContent);

    console.log(`\n🔀 Changing directory to: ${fullPath}`);
    chdir(fullPath);
    console.log(`   Current directory: ${process.cwd()}`);

    try {
      await runCommand('cdparanoia', ['-B']);
    } catch (_error) {
      console.log('\n🔀 Skipping cdparanoia step due to error.');
    }

    await runCommand('eject');

    await convertWavFilesToFlac();

    console.log('\n🏷️  Renaming .flac files...');
    await runCommand(path.resolve(__dirname, '../../scripts/wav2flac.sh'));

    console.log(`\n🖼️  Fetching album cover... `);
    await runCommand(path.resolve(__dirname, '../../scripts/cover.photo.sh'), [`--releaseId`, releaseId]);

    console.log('\n✏️  Tagging tracks...');
    await runCommand(path.resolve(__dirname, '../../scripts/tag.tracks.sh'), ['-f', '../../tracks.txt']);

    console.log(`\n🔀 Returning to starting directory: ${initialDir}`);
    chdir(initialDir);

    console.log('\n🎉 All tasks completed successfully!');
  } catch (error: unknown) {
    if (process.cwd() !== initialDir) {
      console.log(`\n🔀 An error occurred. Returning to starting directory...`);
      chdir(initialDir);
    }

    if (error instanceof DiscogsApiError) {
      console.error(`\n❌ API Error: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`\n❌ An unexpected error occurred: ${error.message}`);
    } else {
      console.error('\n❌ An unknown and unexpected error occurred.');
    }

    exit(1);
  }
}

const { disc, releaseId } = getCommandLineArgs();
console.log(`${disc}`);
main({ releaseId, disc }).catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  exit(1);
});
