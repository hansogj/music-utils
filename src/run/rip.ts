#!/usr/bin/env node

import '../utils/polyfills';

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path, { join } from 'node:path';
import { chdir, exit } from 'node:process';

import { DiscogsApiError, lookupRelease, LookupReleaseOptions, LookupResult } from '@hansogj/discogs-item-lookup';
import * as dotenv from 'dotenv';

import { tagAlbum } from '../album';
import { DISC_NO_SPLIT } from '../constants';
import { coverFromDiscogs } from '../covers/photo';
import { Release } from '../types';
import { getCommandLineArgs } from '../utils/cmd.options';
import { replaceDangers } from '../utils/path';
import { albumPrompt } from '../utils/prompt';
import { syncTrackNames } from '../utils/sync.tag.path';

function runCommand(command: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️  Running command: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { stdio: 'inherit' });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        console.log(`✅ Command finished successfully.`);
        resolve();
      } else {
        reject(new Error(`Command "${command}" exited with error code ${code}`));
      }
    });

    child.on('error', (err: Error) => {
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

function sanitizePath(input: string): string {
  return input.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

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

function buildFolderName(release: Partial<Release>): string {
  const safeTitle = sanitizePath(release.album ?? '');
  const { discNumber, noOfDiscs, aux } = release;
  const discSuffix =
    noOfDiscs && parseInt(noOfDiscs, 10) > 1 ? ` (Disc ${discNumber}${DISC_NO_SPLIT}${noOfDiscs})` : '';
  const auxSuffix = aux ? ` [${aux}]` : '';
  return `${release.year} ${safeTitle}${discSuffix}${auxSuffix}`;
}

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
        await rm(wavFile);
      }
    } catch (error) {
      console.error(`Error processing ${wavFile}:`, error);
      console.log(`Skipping ${wavFile} due to error.`);
    }
  }

  console.log('✅ Conversion to .flac complete.');
}

async function renameFlacFiles(): Promise<void> {
  console.log('\n🏷️  Renaming .flac files...');
  const files = (await readdir('.')).filter((f) => f.endsWith('.flac'));

  for (const file of files) {
    let newName = file
      .replace(/track(\d\d)\.cdda\.flac/, '$1 track.flac')
      .replace(/Track\s(\d+)\.flac/, '$1 track.flac');

    if (/^\d\s/.test(newName)) {
      newName = `0${newName}`;
    }

    if (newName !== file) {
      console.log(`   ${file} -> ${newName}`);
      await rename(file, newName);
    }
  }
}

async function main({ releaseId, disc }: Pick<LookupReleaseOptions, 'disc' | 'releaseId'>): Promise<void> {
  const initialDir = process.cwd();
  dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });

  try {
    console.log(`🔍 Looking up Discogs release ID: ${releaseId}...`);
    const releaseData: LookupResult = await lookupRelease({ releaseId, disc, token: process.env.DISCOGS_TOKEN });
    console.log(`💿 Found: ${releaseData.artist} - ${releaseData.title}`);

    const noOfDiscs = releaseData.discs.length;
    const releaseInfo: Partial<Release> = {
      artist: sanitizePath(releaseData.artist),
      album: releaseData.title,
      year: `${releaseData.masterYear}`,
      discNumber: `${disc || 1}`,
      noOfDiscs: `${noOfDiscs}`,
    };

    const confirmed = await albumPrompt(releaseInfo);
    const safeArtist = sanitizePath(confirmed.artist ?? '');
    const folderName = buildFolderName(confirmed);
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

    try {
      await runCommand('eject');
    } catch (_error) {
      console.log('not able to eject cd ');
    }

    await convertWavFilesToFlac();
    await renameFlacFiles();

    console.log(`\n🖼️  Fetching album cover... `);
    await coverFromDiscogs({ releaseId, quiet: true, token: process.env.DISCOGS_TOKEN ?? '' });

    console.log('\n✏️  Tagging tracks...');
    const trackLines = readFileSync(path.resolve('../../tracks.txt'), 'utf8');
    const tracks = trackLines.split('\n').defined().map(replaceDangers);
    const { files, release: taggedRelease } = await tagAlbum(process.cwd(), tracks);
    await syncTrackNames(files, taggedRelease as Release);

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
main({ releaseId, disc }).catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  exit(1);
});
