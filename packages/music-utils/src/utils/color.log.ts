import chalk, { Chalk } from 'chalk';

import { getCommandLineArgs } from './cmd.options';

type Mode = 'success' | 'info' | 'error' | 'warning';

const modes: Record<Mode, Chalk> = {
  success: chalk.greenBright,
  warning: chalk.yellow,
  info: chalk.bgBlackBright.cyanBright.bold,
  error: chalk.redBright.bgBlack,
};

const logger = (message: unknown, mode: Mode = 'success'): string => {
  console.log(modes[mode](`${message}`));
  return `${message}`;
};

export const error = (message: unknown) => logger(message, 'error');
export const info = (message: unknown) => logger(message, 'info');
export const warning = (message: unknown) => logger(message, 'warning');
export const success = (message: unknown) => logger(message, 'success');

export const json = (message: object) => {
  logger(JSON.stringify(message, null, 4), 'info');
  return message;
};

let _verbose: boolean | undefined;

const isVerbose = () => {
  if (_verbose === undefined) _verbose = getCommandLineArgs().verbose;
  return _verbose;
};

export const debugInfo = (message: unknown) => {
  if (isVerbose()) logger(JSON.stringify(message, null, 4), 'warning');
  return message;
};

export const exit = (message = 'Ending  music utils') => {
  error(message);
  process.exit(0);
};

export default logger;
