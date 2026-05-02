/* eslint-disable @typescript-eslint/no-explicit-any */
import * as childProcess from 'child_process';

import { MockUtil } from './__mocks__/mockutils';
import { execute } from './execute';

jest.mock('child_process');
const mocks = MockUtil<typeof childProcess>(jest).requireMocks('child_process');

type Callback = (error: any, stdout: string, stderr: string) => void;
describe('execute', () => {
  describe('when error occures', () => {
    beforeEach(() => mocks.exec.mockImplementation((_: any, cb: Callback) => cb('some error', null, null)));
    it('should reject', async () => {
      expect.assertions(1);
      return execute('cd').catch((e) => expect(e.message).toContain('Rejecting cmd because of some error'));
    });
  });
  describe('when error is thrown', () => {
    beforeEach(() =>
      mocks.exec.mockImplementation(() => {
        throw new Error('some thrown error');
      }),
    );
    it('should reject', async () => {
      expect.assertions(1);
      return execute('cd').catch((e) =>
        expect(e.message).toContain('Rejecting cmd - Error Thrown - Error: some thrown error'),
      );
    });
  });

  describe('when all is well', () => {
    beforeEach(() => mocks.exec.mockImplementation((_: any, cb: Callback) => cb(false, 'then what?', null)));
    it('should resolve', () => expect(execute('cd')).resolves.toBe('then what?'));
  });

  describe('when stdout is empty', () => {
    beforeEach(() => mocks.exec.mockImplementation((_: any, cb: Callback) => cb(false, '', null)));
    it('should resolve with empty string', () => expect(execute('cd')).resolves.toBe(''));
  });

  describe('when error includes stdout', () => {
    beforeEach(() =>
      mocks.exec.mockImplementation((_: any, cb: Callback) => cb('command failed', 'partial output', null)),
    );
    it('should include stdout in rejection message', async () => {
      expect.assertions(2);
      return execute('bad-cmd').catch((e) => {
        expect(e.message).toContain('Rejecting cmd because of command failed');
        expect(e.message).toContain('partial output');
      });
    });
  });

  describe('passes the command string to exec', () => {
    beforeEach(() => mocks.exec.mockImplementation((_: any, cb: Callback) => cb(false, '', null)));
    it('should pass the exact command', async () => {
      await execute('metaflac --show-tag=TITLE "my file.flac"');
      expect(mocks.exec).toHaveBeenCalledWith('metaflac --show-tag=TITLE "my file.flac"', expect.any(Function));
    });
  });
});
