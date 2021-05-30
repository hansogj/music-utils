import { exec } from 'child_process';

export const execute = <T>(cmd: string): Promise<T> =>
  new Promise((resolve, reject) => {
    try {
      exec(cmd, (err, stdout) => {
        if (!err) {
          resolve((stdout as unknown) as T);
        } else {
          reject(new Error(`Rejecting cmd because of ${err} \n ${stdout}`));
        }
      });
    } catch (error) {
      reject(new Error(`Rejecting cmd - Error Thrown - ${error}`));
    }
  });
