#TODO

## Missing option "o"

In cases like

´´´ 
⚠ The release has 22 tracks, your 4 disc folders 47: it may split the songs differently
  Disc 1∕4 → release tracks 1–9 of 22
  
   .......
  [Enter] OK   [n] Start at another track: 

´´´ 

I am missing the option "[o] Start album over"
Note (Claude): the prompt is in `scripts/audit/src/repair/discogs-action.ts:110` and goes through `ask()`, so
`o` most likely works there already (RestartSignal while restartable) — it is just not listed. Check, then
add `[o] Start album over` to the prompt text (and other prompts that leave it out).

## Resume an interrupted audit (`--from`)

Asked 2026-11-23 while an audit was at album 55 of 155. Today there is no resume:

- A re-run scans everything again. Albums fixed/tagged with a Discogs release ID no longer show (unless
  issues are left, or `--retag`); albums skipped with `[s]`, or left with issues, come back.
- The repair log (`~/.local/share/music-audit/*-repair.log`) is history only: no auto-skip.
- Work-around: a narrower `--root` (a letter or artist folder) re-runs just the remaining part.
- Code changes need no interruption: work in a git worktree; a running audit has loaded its code already.

Ideas (not decided):

1. `--from "Artist"` (or a path): skip albums whose artist folder sorts before it (walk order), so a
   re-run starts where the last one stopped.
2. Or skip albums already handled in today's repair log (fixed or skipped), opt-in (`--resume`).
3. Print the album to resume from (`--from "…"`) when the user quits with `q`.

Open questions: artist or album granularity; how skipped albums should count; resume from the log
automatically or only on request.
