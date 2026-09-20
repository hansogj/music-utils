import fs from 'node:fs/promises';
import path from 'node:path';

import type { AlbumAudit, Issue, Severity } from './types.js';

export type RunMode = 'audit' | 'repair' | 'retag';

interface SessionEvent {
  type: 'session';
  ts: string;
  mode: RunMode;
  root: string;
}

interface AlbumEvent {
  type: 'album';
  ts: string;
  albumPath: string;
  artistName: string;
  albumFolder: string;
  issueCount: number;
  issues: Pick<Issue, 'severity' | 'code' | 'message' | 'file'>[];
}

interface SummaryEvent {
  type: 'summary';
  ts: string;
  albumsScanned: number;
  tracksScanned: number;
  albumsWithIssues: number;
  issuesBySeverity: Record<Severity, number>;
}

type LogEvent = SessionEvent | AlbumEvent | SummaryEvent;

export class AuditLogger {
  constructor(private readonly logPath: string) {}

  async logSession(mode: RunMode, root: string): Promise<void> {
    await this.append({ type: 'session', ts: now(), mode, root });
  }

  async logAlbum(audit: AlbumAudit): Promise<void> {
    await this.append({
      type: 'album',
      ts: now(),
      albumPath: audit.layout.albumPath,
      artistName: audit.layout.artistName,
      albumFolder: audit.layout.albumFolder,
      issueCount: audit.issues.length,
      issues: audit.issues.map(({ severity, code, message, file }) => ({ severity, code, message, file })),
    });
  }

  async logSummary(summary: {
    albumsScanned: number;
    tracksScanned: number;
    albumsWithIssues: number;
    issuesBySeverity: Record<Severity, number>;
  }): Promise<void> {
    await this.append({ type: 'summary', ts: now(), ...summary });
  }

  private async append(event: LogEvent): Promise<void> {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    await fs.appendFile(this.logPath, JSON.stringify(event) + '\n', 'utf8');
  }
}

function now(): string {
  return new Date().toISOString();
}
