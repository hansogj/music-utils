const commandLineArgs = require('command-line-args');

const optionDefinitions = [
  { name: 'verbose', alias: 'v', type: Boolean },

  { name: 'fileName', alias: 'f', type: String },
];
export const getCommandLineArgs = () => commandLineArgs(optionDefinitions);
