import readline from 'node:readline/promises';

// Prompts for the repair session: ask() ("o" restarts the album), setPrompt() for tests,
// RestartSignal / BackSignal.

// Created lazily on first prompt: an eager readline at import time resumes stdin,
// which keeps non-interactive runs (--json, plain report) alive forever on a TTY.
let rl: readline.Interface | undefined;

export function closeRl() {
  rl?.close();
  rl = undefined;
}

// The answer a prompt gives for Ctrl+C (tests answer it too).
export const CTRL_C = '\u0003';

// The question waiting for an answer: Ctrl+C aborts it.
let pending: AbortController | undefined;

// Ctrl+C at a prompt answers it with CTRL_C; anywhere else (a Discogs fetch, waiting for
// the scan) it ends the run, as it did before readline caught it.
function openRl(): readline.Interface {
  // No prompt of its own: clearing the line after Ctrl+C would draw readline's "> ".
  const created = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '' });
  created.on('SIGINT', () => (pending ? pending.abort() : abortRun()));
  return created;
}

function abortRun(): never {
  closeRl();
  console.log('\n  Repair aborted.');
  process.exit(130);
}

// `prefill` is typed into the input line for the user to edit.
export let prompt = async (q: string, prefill?: string): Promise<string> => {
  rl ??= openRl();
  const abort = new AbortController();
  pending = abort;
  const answer = rl.question(q, { signal: abort.signal });
  if (prefill) rl.write(prefill);
  try {
    return await answer;
  } catch (err) {
    if (!abort.signal.aborted) throw err;
    rl.write(null, { ctrl: true, name: 'u' }); // drop what was typed
    return CTRL_C;
  } finally {
    pending = undefined;
  }
};

// Lines until an empty one, as pasted: readline's question() would take the first line
// and drop the rest.
let promptLines = (): Promise<string[]> => {
  rl ??= openRl();
  const input = rl;
  return new Promise((resolve) => {
    const lines: string[] = [];
    const onLine = (line: string) => {
      if (line.trim()) return void lines.push(line);
      input.off('line', onLine);
      resolve(lines);
    };
    input.on('line', onLine);
  });
};

// Tests answer prompts through this instead of stdin; pasted lines are answers too, one
// per prompt, ending with ''.
export function setPrompt(fn: (q: string, prefill?: string) => Promise<string>): void {
  prompt = fn;
  promptLines = async () => {
    const lines: string[] = [];
    for (let line = await fn(''); line.trim(); line = await fn('')) lines.push(line);
    return lines;
  };
}

export function askLines(): Promise<string[]> {
  return promptLines();
}

// Answers that leave the prompt: thrown by ask(), caught by repairAlbum(). Error handlers
// around actions pass them on (instanceof PromptSignal).
export class PromptSignal extends Error {}

// Answering "o" at any prompt while an album is being repaired starts that album over.
export class RestartSignal extends PromptSignal {
  constructor() {
    super('restart album');
  }
}

// "q" or Ctrl+C at any prompt, confirmed: ends the repair run.
export class QuitSignal extends PromptSignal {
  constructor() {
    super('quit repair');
  }
}

let restartable = false;

// On while an album is being repaired: then "o" restarts it and "q" / Ctrl+C quit.
export function setRestartable(on: boolean): void {
  restartable = on;
}

export async function ask(q: string, prefill?: string): Promise<string> {
  while (true) {
    const raw = await prompt(q, prefill);
    if (!restartable) {
      if (raw === CTRL_C) abortRun(); // no album to finish
      return raw.trim();
    }
    const answer = raw.trim();
    if (answer.toLowerCase() === 'o') throw new RestartSignal();
    if (raw !== CTRL_C && answer.toLowerCase() !== 'q') return answer;
    // Guards a stray q; Ctrl+C here quits at once.
    const sure = await prompt('  Quit repair? [Y/n] ');
    if (sure === CTRL_C || sure.trim().toLowerCase() !== 'n') throw new QuitSignal();
  }
}

export class BackSignal extends Error {
  constructor() {
    super('back');
  }
}
