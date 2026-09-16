import http from 'node:http';
import { execFile } from 'node:child_process';
import type { AlbumAudit, AuditReport, DiscogsSearchResult, Issue, Severity } from './types.js';

const PORT = 7171;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderIssue(issue: Issue): string {
  const cls = issue.severity.toLowerCase();
  const file = issue.file ? `<span class="file">[${esc(issue.file)}]</span> ` : '';
  const suggestion = issue.suggestion
    ? `<div class="suggestion">→ ${esc(issue.suggestion)}</div>`
    : '';
  return `<div class="issue ${cls}"><span class="badge">${issue.severity}</span> ${file}${esc(issue.message)}${suggestion}</div>`;
}

function renderDiscogs(results: DiscogsSearchResult[]): string {
  if (results.length === 0) return '';
  const items = results
    .map((r) => {
      const yr = r.year ? ` (${r.year})` : '';
      const genres = [...(r.genre ?? []), ...(r.style ?? [])].slice(0, 3).join(', ');
      const genreSpan = genres ? ` <span class="genre">${esc(genres)}</span>` : '';
      const master = r.masterUrl
        ? ` · <a href="${esc(r.masterUrl)}" target="_blank" rel="noopener">master</a>`
        : '';
      return `<li><a href="${esc(r.releaseUrl)}" target="_blank" rel="noopener">[${r.id}] ${esc(r.title)}${esc(yr)}</a>${master}${genreSpan}</li>`;
    })
    .join('');
  return `<div class="discogs"><strong>Discogs suggestions</strong><ul>${items}</ul></div>`;
}

function renderAlbum(audit: AlbumAudit): string {
  if (audit.issues.length === 0) return '';
  const { layout, tracks, issues, discogsResults } = audit;
  const loc = layout.letterDir
    ? `${layout.letterDir}/${layout.artistName}/${layout.albumFolder}`
    : `${layout.artistName}/${layout.albumFolder}`;
  return `
    <div class="album">
      <div class="album-header">
        <span class="loc">${esc(loc)}</span>
        <span class="tc">${tracks.length} track${tracks.length !== 1 ? 's' : ''}</span>
      </div>
      ${issues.map(renderIssue).join('')}
      ${discogsResults?.length ? renderDiscogs(discogsResults) : ''}
    </div>`;
}

function renderSection(severity: Severity, audits: AlbumAudit[]): string {
  const matching = audits.filter((a) => a.issues.some((i) => i.severity === severity));
  if (matching.length === 0) return '';
  const count = matching.reduce((n, a) => n + a.issues.filter((i) => i.severity === severity).length, 0);
  const cls = severity.toLowerCase();
  return `
    <section class="${cls}">
      <h2>${severity} — ${count} issue(s) in ${matching.length} album(s)</h2>
      ${matching.map(renderAlbum).join('')}
    </section>`;
}

function buildHtml(report: AuditReport): string {
  const { summary } = report;
  const { SEVERE, HIGH, MODERATE } = summary.issuesBySeverity;
  const clean = SEVERE + HIGH + MODERATE === 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Music Audit — ${esc(report.date)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:monospace;font-size:14px;background:#0d1117;color:#e6edf3;padding:2rem}
h1{font-size:1.1rem;color:#fff;margin-bottom:.4rem}
.meta{color:#8b949e;margin-bottom:1.5rem;line-height:1.6}
.counts{display:flex;gap:.75rem;margin-bottom:2rem;flex-wrap:wrap}
.counts span{padding:.2rem .65rem;border-radius:4px;font-weight:bold;font-size:.8rem}
.counts .severe{background:#3d1f1f;color:#f85149}
.counts .high{background:#2d2206;color:#d29922}
.counts .moderate{background:#0d2136;color:#58a6ff}
section{margin-bottom:2.5rem}
section h2{font-size:.95rem;padding:.4rem 0;border-bottom:1px solid;margin-bottom:1rem}
section.severe h2{color:#f85149;border-color:#f85149}
section.high h2{color:#d29922;border-color:#d29922}
section.moderate h2{color:#58a6ff;border-color:#58a6ff}
.album{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:1rem;margin-bottom:.75rem}
.album-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.6rem}
.loc{font-weight:bold}
.tc{color:#8b949e;font-size:.8rem}
.issue{margin:.35rem 0;padding:.35rem .7rem;border-left:3px solid;border-radius:0 4px 4px 0;line-height:1.5}
.issue.severe{border-color:#f85149;background:#1a0b0b}
.issue.high{border-color:#d29922;background:#1a1100}
.issue.moderate{border-color:#58a6ff;background:#0a1628}
.badge{font-size:.7rem;font-weight:bold;padding:.1rem .35rem;border-radius:3px;margin-right:.4rem;vertical-align:middle}
.severe .badge{background:#f85149;color:#000}
.high .badge{background:#d29922;color:#000}
.moderate .badge{background:#58a6ff;color:#000}
.file{color:#8b949e;margin-right:.3rem}
.suggestion{color:#3fb950;margin-top:.2rem;padding-left:1.2rem;font-size:.85rem}
.discogs{margin-top:.75rem;padding:.6rem .9rem;background:#0d1117;border-radius:4px}
.discogs strong{color:#8b949e;display:block;margin-bottom:.35rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
.discogs ul{list-style:none}
.discogs li{padding:.2rem 0}
.discogs a{color:#58a6ff;text-decoration:none}
.discogs a:hover{text-decoration:underline}
.genre{color:#8b949e;font-size:.8rem;margin-left:.4rem}
.clean{color:#3fb950;margin-top:1.5rem;font-size:1rem}
</style>
</head>
<body>
<h1>Music Library Audit</h1>
<div class="meta">
  Root: ${esc(report.root)}<br>
  Date: ${esc(report.date)}<br>
  ${summary.albumsScanned} albums · ${summary.tracksScanned} tracks · ${summary.albumsWithIssues} with issues
</div>
<div class="counts">
  <span class="severe">${SEVERE} severe</span>
  <span class="high">${HIGH} high</span>
  <span class="moderate">${MODERATE} moderate</span>
</div>
${renderSection('SEVERE', report.audits)}
${renderSection('HIGH', report.audits)}
${renderSection('MODERATE', report.audits)}
${clean ? '<p class="clean">✓ No issues found — library looks clean!</p>' : ''}
</body>
</html>`;
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  execFile(cmd, [url], () => {});
}

export function serveReport(report: AuditReport): void {
  const html = buildHtml(report);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://localhost:${PORT}`;
    process.stderr.write(`\nAudit UI: ${url}\nCtrl-C to stop.\n\n`);
    openBrowser(url);
  });
}
