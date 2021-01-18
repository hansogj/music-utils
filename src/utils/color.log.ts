/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import chalk from 'chalk';

type Mode = 'success' | 'info' | 'error' | 'warning';

const logger = (message: any, mode: Mode = 'success'): string => {
  const modes: Hash<Function> = {
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
export const json = (message: Object) => logger(JSON.stringify(message, null, 4), 'info');

export const exit = (message: string = 'Ending  music utils') => {
  error(message);
  process.exit(0);
};

export default logger;
