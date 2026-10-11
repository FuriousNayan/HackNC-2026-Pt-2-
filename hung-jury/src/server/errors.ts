export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export const badRequest = (m: string, code?: string) => new ApiError(400, m, code);
export const unauthorized = (m = 'Sign in first') => new ApiError(401, m, 'unauthorized');
export const forbidden = (m = 'Not allowed') => new ApiError(403, m, 'forbidden');
export const notFound = (m = 'Not found') => new ApiError(404, m, 'not_found');
export const conflict = (m: string, code?: string) => new ApiError(409, m, code);
export const tooMany = (m = 'Slow down') => new ApiError(429, m, 'rate_limited');
