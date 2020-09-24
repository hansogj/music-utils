/* eslint-disable @typescript-eslint/no-explicit-any */

export type MockedModule = { [key: string]: jest.Mock };

export const MockUtil = (jest: { requireMock: (arg0: string) => MockedModule }) => {
  const requireMock = (path: string) => jest.requireMock(path) as MockedModule;

  const requireMocks = (...modules: string[]) =>
    modules.map(requireMock).reduce((comp, curr) => ({ ...comp, ...curr }), {} as MockedModule);

  return { requireMock, requireMocks };
};
