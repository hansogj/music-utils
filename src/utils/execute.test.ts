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
      })
    );
    it('should reject', async () => {
      expect.assertions(1);
      return execute('cd').catch((e) =>
        expect(e.message).toContain('Rejecting cmd - Error Thrown - Error: some thrown error')
      );
    });
  });

  describe('when all is well', () => {
    beforeEach(() => mocks.exec.mockImplementation((_: any, cb: Callback) => cb(false, 'then what?', null)));
    it('should resolve', () => expect(execute('cd')).resolves.toBe('then what?'));
  });
});
