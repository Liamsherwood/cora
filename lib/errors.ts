/** Errors the API layer maps to HTTP status codes. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

export const notFound = (what: string) =>
  new AppError(`${what} not found`, 404, "not_found")
export const conflict = (msg: string, details?: unknown) =>
  new AppError(msg, 409, "conflict", details)
export const unprocessable = (msg: string, details?: unknown) =>
  new AppError(msg, 422, "unprocessable", details)
export const unauthorized = (msg = "invalid signature") =>
  new AppError(msg, 401, "unauthorized")
