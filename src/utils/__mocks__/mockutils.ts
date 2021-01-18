export type MockedModule<T> = { [P in keyof T]?: jest.Mock };

export const MockUtil = <T>(jest: { requireMock: (arg0: string) => MockedModule<T> }) => {
  const requireMock = (path: string) => jest.requireMock(path) as MockedModule<T>;

  const requireMocks = (...modules: string[]) =>
    modules.map(requireMock).reduce((comp, curr) => {
      const alreadyMockedMethods = Object.keys(comp)
        .filter((mockedMethod) => mockedMethod !== '__esModule')
        .filter((mockedMethod) => Object.keys(curr).includes(mockedMethod));

      if (alreadyMockedMethods.length) {
        throw new Error(`Attempting to mock method where mock already exist: ${alreadyMockedMethods.join(', ')}`);
      }

      return { ...comp, ...curr };
    }, {} as MockedModule<T>);

  return { requireMock, requireMocks };
};
