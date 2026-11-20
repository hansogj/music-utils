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

// `prefill` is typed into the input line for the user to edit.
export let prompt = async (q: string, prefill?: string): Promise<string> => {
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = rl.question(q);
  if (prefill) rl.write(prefill);
  return answer;
};

// Lines until an empty one, as pasted: readline's question() would take the first line
// and drop the rest.
let promptLines = (): Promise<string[]> => {
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
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

// Answering "o" at any prompt while an album is being repaired starts that album over.
export class RestartSignal extends Error {
  constructor() {
    super('restart album');
  }
}
let restartable = false;

// On while an album is being repaired: then "o" restarts it.
export function setRestartable(on: boolean): void {
  restartable = on;
}

export async function ask(q: string, prefill?: string): Promise<string> {
  const answer = (await prompt(q, prefill)).trim();
  if (restartable && answer.toLowerCase() === 'o') throw new RestartSignal();
  return answer;
}

export class BackSignal extends Error {
  constructor() {
    super('back');
  }
}
