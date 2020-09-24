import { exec } from 'child_process';

export const execute = (cmd: string) =>
  new Promise((resolve, reject) => {
    try {
      exec(cmd, (err, stdout) => {
        if (!err && !!stdout) {
          resolve(stdout);
        } else {
          reject(err);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
