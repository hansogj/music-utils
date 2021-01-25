const commandLineArgs = require('command-line-args');

const optionDefinitions = [
  { name: 'verbose', alias: 'v', type: Boolean },
  { name: 'fileName', alias: 'f', type: String, multiple: true },
  { name: 'album', alias: 'a', type: String, multiple: true },
];

const parseCommandLineArgs = () => {
  const args = commandLineArgs(optionDefinitions);

  return {
    ...args,
    ...(args.album && { album: args.album.join(' ') }),
    ...(args.fileName && { fileName: args.fileName.join(' ') }),
  };
};

export const getCommandLineArgs = () => parseCommandLineArgs();
