import { exec, execFile } from 'node:child_process';

export const execute = (cmd: string): Promise<string> =>
  new Promise((resolve, reject) => {
    try {
      exec(cmd, (err, stdout) => {
        if (!err) {
          resolve(stdout);
        } else {
          reject(new Error(`Rejecting cmd because of ${err} \n ${stdout}`));
        }
      });
    } catch (error) {
      reject(new Error(`Rejecting cmd - Error Thrown - ${error}`));
    }
  });

export const executeFile = (bin: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    try {
      execFile(bin, args, (err, stdout) => {
        if (!err) {
          resolve(stdout);
        } else {
          reject(new Error(`Rejecting cmd because of ${err} \n ${stdout}`));
        }
      });
    } catch (error) {
      reject(new Error(`Rejecting cmd - Error Thrown - ${error}`));
    }
  });
