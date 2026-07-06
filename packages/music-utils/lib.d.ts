/* eslint-disable @typescript-eslint/no-explicit-any */
declare interface Hash<T> {
  [details: string]: T;
}

declare module '*.json' {
  const value: any;
  export default value;
}
