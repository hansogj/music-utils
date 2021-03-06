import commandLineArgs from 'command-line-args';

const optionDefinitions = [
  { name: 'verbose', alias: 'v', type: Boolean },
  { name: 'fileName', alias: 'f', type: String, multiple: true },
  { name: 'album', alias: 'a', type: String, multiple: true },
];

const parseCommandLineArgs = () => {
  const { verbose, album, fileName } = commandLineArgs(optionDefinitions);

  return {
    ...{ verbose },
    ...(album && { album: album.join(' ') }),
    ...(fileName && { fileName: fileName.join(' ') }),
  };
};

export const getCommandLineArgs = (): ReturnType<typeof parseCommandLineArgs> => {
  try {
    return parseCommandLineArgs();
  } catch (e) {
    console.error('\x1b[30m\x1b[41m%s\x1b[0m', '\n\nWrong number of arguments. \n See Readme file for how to use\n');
    process.exit(0);
  }
};
