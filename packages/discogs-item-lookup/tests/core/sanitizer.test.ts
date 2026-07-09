import { describe, it, expect } from 'vitest';
import { sanitizeReleaseId } from '../../src/core/sanitizer';

describe('sanitizeReleaseId', () => {
  it('should return only digits from a string', () => {
    expect(sanitizeReleaseId('r249504')).toBe('249504');
  });

  it('should handle strings with brackets and other characters', () => {
    expect(sanitizeReleaseId('[r249504]')).toBe('249504');
  });

  it('should return an empty string if no digits are present', () => {
    expect(sanitizeReleaseId('abc-def')).toBe('');
  });

  it('should handle an already numeric string', () => {
    expect(sanitizeReleaseId('12345')).toBe('12345');
  });

  it('should handle an empty string', () => {
    expect(sanitizeReleaseId('')).toBe('');
  });
});
