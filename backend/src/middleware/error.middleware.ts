import { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string = 'Bad Request', errors?: unknown) {
    super(400, message, errors);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string = 'Not Found') {
    super(404, message);
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';
  const errors = err instanceof HttpError ? err.errors : undefined;

  // Log server errors (5xx)
  if (statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error('Unhandled Server Error:', err);
  }

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(errors ? { errors } : {}),
  });
}
