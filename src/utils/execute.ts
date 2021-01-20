import { exec } from 'child_process';

export const execute = (cmd: string) =>
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
      reject(new Error(`Rejecting cmd because of ${error}`));
    }
  });
