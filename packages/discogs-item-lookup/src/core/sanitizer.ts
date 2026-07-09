/**
 * Sanitizes a release ID string to extract only the numeric part.
 * @param releaseId The raw release ID from user input.
 * @returns The numeric-only release ID.
 */
export function sanitizeReleaseId(releaseId: string): string {
  return releaseId.replace(/\D/g, '');
}
