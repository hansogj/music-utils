// Scan progress: a bar with "n/m" for the album scan.
//
// Report mode redraws one line on stderr while it scans. Repair mode can't redraw while
// a prompt is waiting for an answer, so it prints the progress in each album's header
// and draws the live line only while you wait for the scan to find the next album.

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** "▕██████░░░░░░▏ 12/340  4%" */
export function progressBar(done: number, total: number, width = 24): string {
  const ratio = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 1;
  const filled = Math.round(ratio * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `▕${bar}▏ ${done}/${total}  ${Math.floor(ratio * 100)}%`;
}

export interface ProgressStream {
  isTTY?: boolean;
  columns?: number;
  write(s: string): boolean;
}

/** Erases the live line, if any, so a message written next starts at column 0. */
export const CLEAR_LINE = '\r\x1b[K';

/**
 * One self-redrawing progress line. Only draws on a terminal; elsewhere (a pipe, a
 * log file) nothing is written until done().
 */
export class LiveProgress {
  private frame = 0;
  private timer?: ReturnType<typeof setInterval>;
  private shown = false;

  constructor(
    private readonly label: string,
    private readonly progress: () => { done: number; total: number },
    private readonly out: ProgressStream = process.stderr,
    private readonly intervalMs = 120,
  ) {}

  start(): this {
    if (!this.out.isTTY || this.timer) return this;
    this.render();
    this.timer = setInterval(() => this.render(), this.intervalMs);
    this.timer.unref?.();
    return this;
  }

  render(): void {
    if (!this.out.isTTY) return;
    const { done, total } = this.progress();
    const line = `  ${FRAMES[this.frame++ % FRAMES.length]} ${progressBar(done, total)} ${this.label}`;
    // Cut to the terminal width so the line never wraps (a wrapped line can't be redrawn).
    const cols = this.out.columns || 80; // 0 when the terminal size is unknown
    this.out.write(CLEAR_LINE + (line.length >= cols ? line.slice(0, cols - 1) : line));
    this.shown = true;
  }

  /** Stops redrawing and erases the line. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.shown) this.out.write(CLEAR_LINE);
    this.shown = false;
  }
}
