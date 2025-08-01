/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import chalk, { Chalk } from 'chalk';

import { getCommandLineArgs } from './cmd.options';

const { verbose } = getCommandLineArgs();
type Mode = 'success' | 'info' | 'error' | 'warning';

const logger = (message: any, mode: Mode = 'success'): string => {
  const modes: Hash<Chalk> = {
    success: chalk.greenBright,
    warning: chalk.yellow,
    info: chalk.bgBlackBright.cyanBright.bold,
    error: chalk.redBright.bgBlack,
  };

  console.log(modes[mode](`${message}`));
  return message;
};

export const error = (message: any) => logger(message, 'error');
export const info = (message: any) => logger(message, 'info');
export const warning = (message: any) => logger(message, 'warning');
export const success = (message: any) => logger(message, 'success');

export const json = (message: object) => {
  logger(JSON.stringify(message, null, 4), 'info');
  return message;
};

export const debugInfo = (message: any) => {
  if (verbose) logger(JSON.stringify(message, null, 4), 'warning');
  return message;
};

export const exit = (message = 'Ending  music utils') => {
  error(message);
  process.exit(0);
};

export default logger;
