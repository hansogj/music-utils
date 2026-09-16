// OSC 8 hyperlinks — supported by iTerm2, GNOME Terminal 3.26+, Windows Terminal, Kitty, etc.
// Unsupported terminals ignore the escape sequences and show plain text.
export function termLink(text: string, url: string): string {
  if (!process.stdout.isTTY) return `${text} <${url}>`;
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}
