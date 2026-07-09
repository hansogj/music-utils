export class DiscogsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscogsApiError';
  }
}
