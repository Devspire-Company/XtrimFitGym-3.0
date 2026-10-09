import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => void handler(req, res, next).catch(next);

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ message: 'The requested endpoint does not exist.' });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    res.status(400).json({ message: 'Please check the submitted information.', fields: error.flatten().fieldErrors });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message, code: error.code });
    return;
  }
  const mongo = error as { code?: number };
  if (mongo?.code === 11000) {
    res.status(409).json({ message: 'That record already exists or conflicts with an active record.' });
    return;
  }
  console.error(error);
  res.status(500).json({ message: 'An unexpected server error occurred.' });
}

