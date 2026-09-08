import chalk from 'chalk';
import type { AlbumAudit, AuditReport, Issue, Severity } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SEV_COLOR: Record<Severity, any> = {
  SEVERE: chalk.red.bold,
  HIGH: chalk.yellow.bold,
  MODERATE: chalk.cyan,
};

const SEV_ICON: Record<Severity, string> = {
  SEVERE: '🔴',
  HIGH: '🟡',
  MODERATE: '🔵',
};

function fmtIssue(issue: Issue): string {
  const c = SEV_COLOR[issue.severity];
  const icon = SEV_ICON[issue.severity];
  const file = issue.file ? chalk.dim(` [${issue.file}]`) : '';
  const msg = `  ${icon} ${c(issue.code)}${file}: ${issue.message}`;
  const fix = issue.suggestion ? `\n     ${chalk.green('→')} ${issue.suggestion}` : '';
  return msg + fix;
}

function fmtAlbum(audit: AlbumAudit, filterSeverity?: Severity): string {
  const { layout, tracks, issues, discogsResults } = audit;
  const visible = filterSeverity ? issues.filter((i) => i.severity === filterSeverity) : issues;
  if (visible.length === 0) return '';

  const loc = layout.letterDir
    ? `${layout.letterDir}/${layout.artistName}/${layout.albumFolder}`
    : `${layout.artistName}/${layout.albumFolder}`;

  const trackCount = chalk.dim(`  (${tracks.length} track${tracks.length !== 1 ? 's' : ''})`);
  const lines = [`\n  ${chalk.bold(loc)}${trackCount}`];
  lines.push(...visible.map(fmtIssue));

  if (discogsResults && discogsResults.length > 0 && (!filterSeverity || filterSeverity === 'SEVERE' || filterSeverity === 'HIGH')) {
    lines.push(`     ${chalk.bold('Discogs suggestions:')}`);
    for (const r of discogsResults) {
      const yr = r.year ? ` (${r.year})` : '';
      const genres = [...(r.genre ?? []), ...(r.style ?? [])].slice(0, 3).join(', ');
      lines.push(`       ${chalk.blue('•')} [${r.id}] ${r.title}${yr}  ${chalk.underline(r.releaseUrl)}`);
      if (r.masterUrl) lines.push(`         master → ${chalk.underline(r.masterUrl)}`);
      if (genres) lines.push(`         ${chalk.dim('genre:')} ${genres}`);
    }
    lines.push(
      `     ${chalk.dim('Use release ID with:')} music-utils-album-tag, music-utils-cover-photo, discogs-lookup`,
    );
  }

  return lines.join('\n');
}

function section(severity: Severity, audits: AlbumAudit[]): void {
  const matching = audits.filter((a) => a.issues.some((i) => i.severity === severity));
  if (matching.length === 0) return;

  const count = matching.reduce((n, a) => n + a.issues.filter((i) => i.severity === severity).length, 0);
  const c = SEV_COLOR[severity];

  console.log(c(`\n${SEV_ICON[severity]} ${severity}  —  ${count} issue(s) in ${matching.length} album(s)`));
  console.log(c('─'.repeat(60)));
  for (const a of matching) {
    const text = fmtAlbum(a, severity);
    if (text) console.log(text);
  }
}

const DS_AUDIO_ENRICHMENT = `
${chalk.bold.white('DS AUDIO ENRICHMENT  (Synology Audio Station 6.5.7)')}
${'─'.repeat(60)}
DS Audio reads standard tags from files — no native Discogs link.
Fields it can display beyond what current tools already write:

  ${chalk.green('High value')}
  • GENRE / TCON        — from Discogs genre + style fields; enables
                          genre-based browsing and smart playlists
  • ALBUMARTIST / TPE2  — critical for "Various Artists" compilations
                          (prevents each track appearing as separate album)
  • COMPOSER / TCOM     — from Discogs track credits; useful for classical/jazz

  ${chalk.yellow('Nice to have')}
  • COMMENT / COMM      — embed the Discogs release URL here for a clickable
                          "open in browser" from any tag editor
  • BPM / TBPM          — from Discogs or AcousticBrainz; useful for electronic

  ${chalk.dim('Custom tags (not shown in DS Audio UI but useful for scripts)')}
  • TXXX:DISCOGS_RELEASE_ID / Vorbis DISCOGS_RELEASE_ID — ties the file to
    a specific pressing; lets future scripts re-fetch metadata without re-searching
  • TXXX:DISCOGS_MASTER_ID  / Vorbis DISCOGS_MASTER_ID  — ties to master release

  ${chalk.dim('What DS Audio cannot use:')}
  • .nfo / .xml folder metadata files (Audio Station ignores them)
  • Embedded MusicBrainz IDs (Audio Station doesn't integrate with MB)

  ${chalk.bold('Recommended enrichment workflow:')}
  1. Use Discogs release ID from audit suggestions above
  2. Run: discogs-lookup <id>            → verify tracklist
  3. Run: music-utils-album-tag          → writes artist/album/year/disc/track
  4. Add genre from Discogs response to a wrapper script that writes GENRE tag
  5. Store Discogs URL in COMMENT for DS Audio visibility
`;

export function printReport(report: AuditReport): void {
  const { summary } = report;

  console.log(chalk.bold.white('\n════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white('  MUSIC LIBRARY AUDIT'));
  console.log(chalk.bold.white('════════════════════════════════════════════════════════════'));
  console.log(`  Root : ${chalk.cyan(report.root)}`);
  console.log(`  Date : ${report.date}`);
  console.log(`  Albums scanned: ${summary.albumsScanned}  |  tracks: ${summary.tracksScanned}  |  with issues: ${summary.albumsWithIssues}`);

  const { SEVERE, HIGH, MODERATE } = summary.issuesBySeverity;
  console.log(
    `  Issues: ${chalk.red.bold(SEVERE + ' severe')}  ·  ${chalk.yellow.bold(HIGH + ' high')}  ·  ${chalk.cyan(MODERATE + ' moderate')}`,
  );

  section('SEVERE', report.audits);
  section('HIGH', report.audits);
  section('MODERATE', report.audits);

  if (SEVERE + HIGH + MODERATE === 0) {
    console.log(chalk.green.bold('\n  ✓ No issues found — library looks clean!'));
  }

  console.log('\n' + chalk.bold.white('SUMMARY'));
  console.log(chalk.bold.white('─'.repeat(60)));
  console.log(`  Albums scanned    : ${summary.albumsScanned}`);
  console.log(`  Tracks scanned    : ${summary.tracksScanned}`);
  console.log(`  Albums with issues: ${summary.albumsWithIssues}`);
  console.log(`  ${chalk.red.bold('Severe')}            : ${SEVERE}`);
  console.log(`  ${chalk.yellow.bold('High')}              : ${HIGH}`);
  console.log(`  ${chalk.cyan('Moderate')}          : ${MODERATE}`);

  console.log(DS_AUDIO_ENRICHMENT);
}
