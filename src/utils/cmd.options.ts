/* eslint-disable consistent-return */
// import 'array.defined/lib/polyfill';

import commandLineArgs from 'command-line-args';

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

const optionDefinitions = [
  { name: 'verbose', alias: 'v', type: Boolean },
  { name: 'tagOnly', alias: 't', type: Boolean },
  { name: 'fileName', alias: 'f', type: String },
  { name: 'album', alias: 'a', type: String },
  { name: 'dirA', alias: 'A', type: String, verbose: true },
  { name: 'dirB', alias: 'B', type: String, verbose: true },
  { name: 'ignore', alias: 'I', type: String, verbose: true, multiple: true },
  { name: 'threshold', alias: 'T', type: Number },
  { name: 'quiet', alias: 'Q', type: Boolean },
  { name: 'releaseId', alias: 'r', type: String },
  { name: 'disc', alias: 'd', type: Number },
];

export const getCommandLineArgs = (): Options => {
  try {
    return commandLineArgs(optionDefinitions) as Options;
  } catch (_) {
    // eslint-disable-next-line no-console
    console.error('\x1b[30m\x1b[41m%s\x1b[0m', '\n\nWrong number of arguments. \n See Readme file for how to use\n');
    process.exit(0);
  }
};
