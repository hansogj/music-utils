import { readFileSync } from 'fs';
import path from 'path';

/** The installed package's version, from its package.json (src/utils or build/utils → ../../). */
export const packageVersion = (): string =>
  (JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;
