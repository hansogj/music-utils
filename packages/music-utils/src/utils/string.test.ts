import { capitalize, removeDoubleSpace, toLowerCase, upperCase } from './string';

describe('upperCase', () => {
  it('capitalizes the first character', () => expect(upperCase('hello')).toBe('Hello'));
  it('handles single character', () => expect(upperCase('a')).toBe('A'));
  it('preserves already uppercase', () => expect(upperCase('Hello')).toBe('Hello'));
  it('handles accented characters', () => expect(upperCase('über')).toBe('Über'));
});

describe('capitalize', () => {
  it('capitalizes each word', () => expect(capitalize('hello world')).toBe('Hello World'));
  it('handles single word', () => expect(capitalize('hello')).toBe('Hello'));
  it('handles already capitalized', () => expect(capitalize('Hello World')).toBe('Hello World'));
  it('handles mixed case', () => expect(capitalize('hELLO wORLD')).toBe('HELLO WORLD'));
  it('handles artist name with accents', () => expect(capitalize('motörhead')).toBe('Motörhead'));
});

describe('removeDoubleSpace', () => {
  it('collapses double spaces', () => expect(removeDoubleSpace('hello  world')).toBe('hello world'));
  it('collapses triple spaces', () => expect(removeDoubleSpace('hello   world')).toBe('hello world'));
  it('trims leading/trailing', () => expect(removeDoubleSpace('  hello  ')).toBe('hello'));
  it('handles single space', () => expect(removeDoubleSpace('hello world')).toBe('hello world'));
  it('handles empty string', () => expect(removeDoubleSpace('')).toBe(''));
  it('handles only spaces', () => expect(removeDoubleSpace('   ')).toBe(''));
});

describe('toLowerCase', () => {
  it('lowercases a string', () => expect(toLowerCase('Hello')).toBe('hello'));
  it('defaults to empty string', () => expect(toLowerCase()).toBe(''));
  it('handles undefined', () => expect(toLowerCase(undefined)).toBe(''));
  it('handles already lowercase', () => expect(toLowerCase('hello')).toBe('hello'));
  it('handles accented characters', () => expect(toLowerCase('ÜBER')).toBe('über'));
});
