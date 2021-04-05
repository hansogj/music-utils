import { getCommandLineArgs, Options } from './cmd.options';

describe('cmd.options', () => {
  describe.each([
    [['-a', 'album'], { album: 'album' }],
    [['--album', 'album'], { album: 'album' }],
    [['-t'], { tagOnly: true }],
    [['-a', 'album'], { album: 'album' }],
  ])('with args %o ', (args: string[], expected: Partial<Options>) => {
    beforeEach(() => (process.argv = ['node', 'jest', ...args]));
    it(`getCommandLineArgs should return ${JSON.stringify(expected)}`, () =>
      expect(getCommandLineArgs()).toEqual(expected));
  });
});
