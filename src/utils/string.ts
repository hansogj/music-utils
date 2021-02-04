/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-globals */
import './polyfills';

export const upperCase = (s: string) => s.slice(0, 1).toLocaleUpperCase() + s.slice(1);

export const capitalize = (s: string) => s.split(' ').map(upperCase).join(' ');

export const removeDoubleSpace = (str: string) => str.split(' ').defined().join(' ');
