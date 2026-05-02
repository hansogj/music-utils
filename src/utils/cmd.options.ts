import { parseArgs } from 'node:util';

export interface Options {
  verbose: boolean;
  tagOnly: boolean;
  fileName: string;
  album: string;
  dirA: string;
  dirB: string;
  ignore: string[];
  threshold: number;
  quiet: boolean;
  releaseId: string;
  disc: number;
}

const options = {
  verbose: { type: 'boolean' as const, short: 'v' },
  tagOnly: { type: 'boolean' as const, short: 't' },
  fileName: { type: 'string' as const, short: 'f' },
  album: { type: 'string' as const, short: 'a' },
  dirA: { type: 'string' as const, short: 'A' },
  dirB: { type: 'string' as const, short: 'B' },
  ignore: { type: 'string' as const, short: 'I', multiple: true },
  threshold: { type: 'string' as const, short: 'T' },
  quiet: { type: 'boolean' as const, short: 'Q' },
  releaseId: { type: 'string' as const, short: 'r' },
  disc: { type: 'string' as const, short: 'd' },
};

export const getCommandLineArgs = (): Options => {
  try {
    const { values } = parseArgs({ options, strict: false, args: process.argv.slice(2) });
    return {
      ...values,
      ...(values.threshold !== undefined && { threshold: Number(values.threshold) }),
      ...(values.disc !== undefined && { disc: Number(values.disc) }),
    } as unknown as Options;
  } catch (_) {
    console.error('\x1b[30m\x1b[41m%s\x1b[0m', '\n\nWrong number of arguments. \n See Readme file for how to use\n');
    process.exit(0);
  }
};
